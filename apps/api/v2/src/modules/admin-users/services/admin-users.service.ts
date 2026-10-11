import { slugify } from "@calcom/platform-libraries";
import type { User } from "@calcom/prisma/client";
import { BookingStatus } from "@calcom/prisma/enums";
import { BadRequestException, Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import { Locales } from "@/lib/enums/locales";
import { BulkCalendarsInput } from "@/modules/admin-users/inputs/bulk-calendars.input";
import { CreateManagedUserInput } from "@/modules/users/inputs/create-managed-user.input";
import { UsersRepository } from "@/modules/users/users.repository";
import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";
import { SchedulesRepository_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/schedules.repository";
import { OutputSchedulesService_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/services/output-schedules.service";
import { SchedulesService_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/services/schedules.service";

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly schedulesService: SchedulesService_2024_06_11,
    private readonly schedulesRepository: SchedulesRepository_2024_06_11,
    private readonly outputSchedulesService: OutputSchedulesService_2024_06_11,
    private readonly bookingsRepository: BookingsRepository_2024_08_13
  ) {}

  // A user without a default schedule cannot be booked.
  async createUser(body: CreateManagedUserInput): Promise<User> {
    const user = await this.usersRepository.create(
      { ...body, locale: body.locale ?? Locales.PT_BR },
      slugify(body.email)
    );
    const defaultSchedule = await this.schedulesService.createUserDefaultSchedule(user.id, user.timeZone);

    return { ...user, defaultScheduleId: defaultSchedule.id };
  }

  async getBulkCalendars({ userIds, start, end }: BulkCalendarsInput) {
    const users = await this.usersRepository.findByIdsWithEventTypes(userIds);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const unknownUserIds = userIds.filter((userId) => !usersById.has(userId));
    if (unknownUserIds.length) {
      // The http exception filter returns the name as error.code and the response as error.details.
      throw Object.assign(new BadRequestException({ userIds: unknownUserIds }), {
        name: "bulk_calendars_invalid",
        message: "One or more users do not exist",
      });
    }

    const scheduleIds = users.flatMap((user) => user.defaultScheduleId ?? []);
    const [schedules, bookings] = await Promise.all([
      this.schedulesRepository.getSchedulesByIds(scheduleIds, 0, scheduleIds.length),
      this.bookingsRepository.getByUserIdsAndStatusesInRange(
        userIds,
        [BookingStatus.ACCEPTED, BookingStatus.CANCELLED],
        DateTime.fromISO(start, { zone: "utc" }).toJSDate(),
        end ? DateTime.fromISO(end, { zone: "utc" }).toJSDate() : undefined
      ),
    ]);
    const outputSchedules = await this.outputSchedulesService.getResponseSchedules(schedules);
    const availabilityByUserId = new Map(
      outputSchedules.map((schedule) => [schedule.ownerId, schedule.availability])
    );
    const bookingsByUserId = new Map<number | null, typeof bookings>();
    for (const booking of bookings) {
      const userBookings = bookingsByUserId.get(booking.userId) ?? [];
      userBookings.push(booking);
      bookingsByUserId.set(booking.userId, userBookings);
    }

    return userIds
      .flatMap((userId) => usersById.get(userId) ?? [])
      .map((user) => ({
        userId: user.id,
        timeZone: user.timeZone,
        availability: availabilityByUserId.get(user.id) ?? [],
        eventTypes: user.eventTypes.map(({ id, slug, length }) => ({ id, slug, lengthInMinutes: length })),
        bookings: (bookingsByUserId.get(user.id) ?? []).map((booking) => ({
          uid: booking.uid,
          eventTypeId: booking.eventTypeId,
          start: booking.startTime,
          end: booking.endTime,
          status: booking.status.toLowerCase(),
          rescheduled: !!booking.rescheduled,
          fromReschedule: booking.fromReschedule,
          createdAt: booking.createdAt,
          updatedAt: booking.updatedAt,
        })),
      }));
  }
}
