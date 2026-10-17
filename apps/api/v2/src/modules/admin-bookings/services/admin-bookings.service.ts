import { IdempotencyKeyService } from "@calcom/platform-libraries/bookings";
import { getWorkingHoursInMillis } from "@calcom/platform-libraries/schedules";
import { BookingStatus } from "@calcom/prisma/enums";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import { BulkRescheduleItem } from "@/modules/admin-bookings/inputs/bulk-reschedule.input";
import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";
import { EventTypesRepository_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/event-types.repository";
import { SchedulesRepository_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/schedules.repository";

type Interval = { uid: string; start: number; end: number };

type Move = Interval & {
  eventTypeId: number;
  owner: { id: number; email: string; timeZone: string; defaultScheduleId: number | null };
  isNoOp: boolean;
};

function groupByUserId<T>(values: T[], getUserId: (value: T) => number | null) {
  const groups = new Map<number | null, T[]>();
  for (const value of values) {
    const group = groups.get(getUserId(value)) ?? [];
    group.push(value);
    groups.set(getUserId(value), group);
  }
  return groups;
}

// Sorted by start, an interval overlaps another one only if it starts before the latest end so far or ends after the next start.
export function getOverlappingUids(intervals: Interval[]): Set<string> {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const overlappingUids = new Set<string>();
  let latestEnd = -Infinity;
  sorted.forEach((interval, i) => {
    const next = sorted[i + 1];
    if (interval.start < latestEnd || (next && next.start < interval.end)) {
      overlappingUids.add(interval.uid);
    }
    latestEnd = Math.max(latestEnd, interval.end);
  });
  return overlappingUids;
}

@Injectable()
export class AdminBookingsService {
  constructor(
    private readonly bookingsRepository: BookingsRepository_2024_08_13,
    private readonly eventTypesRepository: EventTypesRepository_2024_06_14,
    private readonly schedulesRepository: SchedulesRepository_2024_06_11
  ) {}

  async bulkReschedule(items: BulkRescheduleItem[]) {
    const moves = await this.getMoves(items);
    const conflictingUids = await this.getConflictingUids(moves);
    if (conflictingUids.length) {
      // The http exception filter returns the name as error.code and the response as error.details.
      throw Object.assign(new ConflictException({ uids: conflictingUids }), {
        name: "bulk_reschedule_conflict",
        message: "One or more target slots are not free",
      });
    }

    // ponytail: the checks read outside the write transaction, so a concurrent booking can still overlap. Lock the target users if that happens.
    await this.bookingsRepository.updateByUids(
      moves
        .filter((move) => !move.isNoOp)
        .map(({ uid, eventTypeId, owner, start, end }) => ({
          uid,
          data: {
            userId: owner.id,
            eventTypeId,
            startTime: new Date(start),
            endTime: new Date(end),
            userPrimaryEmail: owner.email,
            // The key comes from the host and the times, so the old key would block a new booking at the old slot.
            idempotencyKey: IdempotencyKeyService.generate({
              startTime: new Date(start),
              endTime: new Date(end),
              userId: owner.id,
            }),
          },
        }))
    );

    return moves.map(({ uid, start, end }) => ({ uid, start: new Date(start), end: new Date(end) }));
  }

  private async getMoves(items: BulkRescheduleItem[]): Promise<Move[]> {
    const [bookings, eventTypes] = await Promise.all([
      this.bookingsRepository.getByUids(items.map(({ uid }) => uid)),
      this.eventTypesRepository.getEventTypesByIdsWithOwner(items.map(({ eventTypeId }) => eventTypeId)),
    ]);
    const bookingsByUid = new Map(bookings.map((booking) => [booking.uid, booking]));
    const eventTypesById = new Map(eventTypes.map((eventType) => [eventType.id, eventType]));
    const uidCounts = new Map<string, number>();
    for (const { uid } of items) {
      uidCounts.set(uid, (uidCounts.get(uid) ?? 0) + 1);
    }
    const now = Date.now();

    const moves: Move[] = [];
    const invalidUids = new Set<string>();
    for (const item of items) {
      const booking = bookingsByUid.get(item.uid);
      const eventType = eventTypesById.get(item.eventTypeId);
      // A team event type has no owner, so there is no user to move the booking to.
      if (!booking || !eventType?.owner || uidCounts.get(item.uid) !== 1) {
        invalidUids.add(item.uid);
        continue;
      }

      const start = DateTime.fromISO(item.start, { zone: "utc" }).toMillis();
      const end = start + (item.lengthInMinutes ?? eventType.length) * 60_000;
      const isAccepted = booking.status === BookingStatus.ACCEPTED;
      // The no-op check runs before the time checks, so a retry of a request that succeeded also succeeds.
      const isNoOp =
        isAccepted &&
        booking.userId === eventType.owner.id &&
        booking.eventTypeId === eventType.id &&
        booking.startTime.getTime() === start &&
        booking.endTime.getTime() === end;
      if (!isNoOp && (!isAccepted || booking.startTime.getTime() <= now || start < now)) {
        invalidUids.add(item.uid);
        continue;
      }

      moves.push({ uid: item.uid, eventTypeId: eventType.id, owner: eventType.owner, start, end, isNoOp });
    }

    if (invalidUids.size) {
      throw Object.assign(new BadRequestException({ uids: [...invalidUids] }), {
        name: "bulk_reschedule_invalid",
        message: "One or more items are not valid",
      });
    }

    return moves;
  }

  private async getConflictingUids(moves: Move[]): Promise<string[]> {
    const movesByUserId = groupByUserId(moves, (move) => move.owner.id);
    const owners = moves.map(({ owner }) => owner);
    const scheduleIds = owners.flatMap(({ defaultScheduleId }) => defaultScheduleId ?? []);
    const from = new Date(moves.reduce((min, move) => Math.min(min, move.start), Infinity));
    const to = new Date(moves.reduce((max, move) => Math.max(max, move.end), -Infinity));
    const requestUids = new Set(moves.map(({ uid }) => uid));
    const [schedules, bookings] = await Promise.all([
      this.schedulesRepository.getSchedulesByIds(scheduleIds, 0, scheduleIds.length),
      this.bookingsRepository.getByUserIdsAndStatusesInRange(
        [...new Set(owners.map(({ id }) => id))],
        [BookingStatus.ACCEPTED],
        from,
        to
      ),
    ]);
    const schedulesById = new Map(schedules.map((schedule) => [schedule.id, schedule]));
    // The bookings of the request leave their old times, so only the other bookings block a slot.
    const bookingsByUserId = groupByUserId(
      bookings.filter(({ uid }) => !requestUids.has(uid)),
      (booking) => booking.userId
    );

    const conflictingUids = new Set<string>();
    for (const [userId, userMoves] of movesByUserId) {
      const { owner } = userMoves[0];
      const schedule = owner.defaultScheduleId ? schedulesById.get(owner.defaultScheduleId) : undefined;
      const workingHours = schedule
        ? getWorkingHoursInMillis({
            availability: schedule.availability,
            timeZone: schedule.timeZone ?? owner.timeZone,
            dateFrom: from,
            dateTo: to,
          })
        : [];
      // A no-op is not checked, but its time still blocks the other moves.
      const overlappingUids = getOverlappingUids([
        ...(bookingsByUserId.get(userId) ?? []).map(({ uid, startTime, endTime }) => ({
          uid,
          start: startTime.getTime(),
          end: endTime.getTime(),
        })),
        ...userMoves,
      ]);
      for (const move of userMoves) {
        if (move.isNoOp) continue;
        // ponytail: scans all working hours for each move. Use a binary search if requests get large.
        const isInWorkingHours = workingHours.some(
          (range) => range.start <= move.start && move.end <= range.end
        );
        if (!isInWorkingHours || overlappingUids.has(move.uid)) {
          conflictingUids.add(move.uid);
        }
      }
    }

    return moves.filter(({ uid }) => conflictingUids.has(uid)).map(({ uid }) => uid);
  }
}
