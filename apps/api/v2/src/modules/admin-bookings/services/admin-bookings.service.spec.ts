// Stub the dependencies so the test does not load Prisma and the platform libraries.
jest.mock(
  "@calcom/platform-libraries/bookings",
  () => ({
    IdempotencyKeyService: {
      generate: ({ startTime, endTime, userId }: { startTime: Date; endTime: Date; userId: number }) =>
        `${userId}.${startTime.toISOString()}.${endTime.toISOString()}`,
    },
  }),
  { virtual: true }
);
jest.mock("@calcom/platform-libraries/schedules", () => ({ getWorkingHoursInMillis: jest.fn() }), {
  virtual: true,
});
jest.mock("@/platform/bookings/2024-08-13/repositories/bookings.repository", () => ({
  BookingsRepository_2024_08_13: class {},
}));
jest.mock("@/platform/event-types/event-types_2024_06_14/event-types.repository", () => ({
  EventTypesRepository_2024_06_14: class {},
}));
jest.mock("@/platform/schedules/schedules_2024_06_11/schedules.repository", () => ({
  SchedulesRepository_2024_06_11: class {},
}));

import { getWorkingHoursInMillis } from "@calcom/platform-libraries/schedules";
import { BadRequestException, ConflictException, HttpException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { BulkRescheduleItem } from "@/modules/admin-bookings/inputs/bulk-reschedule.input";
import {
  AdminBookingsService,
  getOverlappingUids,
} from "@/modules/admin-bookings/services/admin-bookings.service";
import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";
import { EventTypesRepository_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/event-types.repository";
import { SchedulesRepository_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/schedules.repository";

const date = (time: string) => new Date(`2030-01-07T${time}:00.000Z`);
const ownerWithSchedule = { id: 1, email: "alice@example.com", timeZone: "UTC", defaultScheduleId: 10 };
const ownerWithoutSchedule = { id: 2, email: "bob@example.com", timeZone: "UTC", defaultScheduleId: null };
const booking = (uid: string, startTime: Date, endTime: Date, overrides = {}) => ({
  uid,
  userId: 5,
  eventTypeId: 999,
  startTime,
  endTime,
  status: "ACCEPTED",
  ...overrides,
});
const item = (uid: string, start: string, overrides: Partial<BulkRescheduleItem> = {}) => ({
  uid,
  eventTypeId: 100,
  start: `2030-01-07T${start}:00Z`,
  ...overrides,
});
const catchError = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error("The promise did not reject");
    },
    (error: HttpException) => error
  );

describe("getOverlappingUids", () => {
  it("finds the intervals that overlap another one, also when one contains others", () => {
    const overlapping = getOverlappingUids([
      { uid: "long", start: 0, end: 10 },
      { uid: "inside", start: 1, end: 2 },
      { uid: "also-inside", start: 5, end: 6 },
      { uid: "touching", start: 10, end: 20 },
      { uid: "same-start", start: 30, end: 31 },
      { uid: "same-start-2", start: 30, end: 40 },
    ]);

    expect([...overlapping].sort()).toEqual(["also-inside", "inside", "long", "same-start", "same-start-2"]);
  });
});

describe("AdminBookingsService", () => {
  let service: AdminBookingsService;
  const bookingsRepository = {
    getByUids: jest.fn(),
    getByUserIdsAndStatusesInRange: jest.fn(),
    updateByUids: jest.fn(),
  };
  const eventTypesRepository = { getEventTypesByIdsWithOwner: jest.fn() };
  const schedulesRepository = { getSchedulesByIds: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockReturnValue(new Date("2030-01-01T00:00:00.000Z").getTime());
    eventTypesRepository.getEventTypesByIdsWithOwner.mockResolvedValue([
      { id: 100, length: 30, owner: ownerWithSchedule },
      { id: 200, length: 30, owner: ownerWithoutSchedule },
      { id: 300, length: 30, owner: null },
    ]);
    schedulesRepository.getSchedulesByIds.mockResolvedValue([{ id: 10, timeZone: "UTC", availability: [] }]);
    jest
      .mocked(getWorkingHoursInMillis)
      .mockReturnValue([{ start: date("09:00").getTime(), end: date("18:00").getTime() }]);
    bookingsRepository.getByUserIdsAndStatusesInRange.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        AdminBookingsService,
        { provide: BookingsRepository_2024_08_13, useValue: bookingsRepository },
        { provide: EventTypesRepository_2024_06_14, useValue: eventTypesRepository },
        { provide: SchedulesRepository_2024_06_11, useValue: schedulesRepository },
      ],
    }).compile();
    service = module.get(AdminBookingsService);
  });

  it("moves the bookings in place and does not write a no-op", async () => {
    bookingsRepository.getByUids.mockResolvedValue([
      booking("move", new Date("2030-01-02T10:00:00.000Z"), new Date("2030-01-02T10:30:00.000Z")),
      booking("noop", date("11:00"), date("11:30"), { userId: 1, eventTypeId: 100 }),
    ]);
    // The old time of a booking in the request does not block the request.
    bookingsRepository.getByUserIdsAndStatusesInRange.mockResolvedValue([
      booking("noop", date("11:00"), date("11:30"), { userId: 1 }),
      booking("other", date("12:00"), date("13:00"), { userId: 1 }),
    ]);

    const result = await service.bulkReschedule([
      item("move", "10:00"),
      item("noop", "11:00", { lengthInMinutes: 30 }),
    ]);

    expect(result).toEqual([
      { uid: "move", start: date("10:00"), end: date("10:30") },
      { uid: "noop", start: date("11:00"), end: date("11:30") },
    ]);
    expect(bookingsRepository.updateByUids).toHaveBeenCalledWith([
      {
        uid: "move",
        data: {
          userId: 1,
          eventTypeId: 100,
          startTime: date("10:00"),
          endTime: date("10:30"),
          userPrimaryEmail: "alice@example.com",
          idempotencyKey: "1.2030-01-07T10:00:00.000Z.2030-01-07T10:30:00.000Z",
        },
      },
    ]);
  });

  it("accepts a started booking that is already at its target as a no-op", async () => {
    bookingsRepository.getByUids.mockResolvedValue([
      booking("started", new Date("2029-12-31T23:30:00.000Z"), new Date("2030-01-01T00:00:00.000Z"), {
        userId: 1,
        eventTypeId: 100,
      }),
    ]);

    const result = await service.bulkReschedule([
      { uid: "started", eventTypeId: 100, start: "2029-12-31T23:30:00Z" },
    ]);

    expect(result).toHaveLength(1);
    expect(bookingsRepository.updateByUids).toHaveBeenCalledWith([]);
  });

  it("rejects the request with every invalid uid and changes nothing", async () => {
    bookingsRepository.getByUids.mockResolvedValue([
      booking("duplicate", date("10:00"), date("10:30")),
      booking("cancelled", date("10:00"), date("10:30"), { status: "CANCELLED" }),
      booking("started", new Date("2029-12-31T23:30:00.000Z"), new Date("2030-01-01T00:30:00.000Z")),
      booking("past-start", date("10:00"), date("10:30")),
      booking("team-event-type", date("10:00"), date("10:30")),
      booking("unknown-event-type", date("10:00"), date("10:30")),
      booking("valid", date("10:00"), date("10:30")),
    ]);

    const error = await catchError(
      service.bulkReschedule([
        item("unknown", "10:00"),
        item("duplicate", "10:00"),
        item("cancelled", "10:00"),
        item("started", "10:00"),
        { uid: "past-start", eventTypeId: 100, start: "2029-12-31T10:00:00Z" },
        item("team-event-type", "10:00", { eventTypeId: 300 }),
        item("unknown-event-type", "10:00", { eventTypeId: 999 }),
        item("duplicate", "11:00"),
        item("valid", "12:00"),
      ])
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.name).toBe("bulk_reschedule_invalid");
    expect(error.getResponse()).toEqual({
      uids: [
        "unknown",
        "duplicate",
        "cancelled",
        "started",
        "past-start",
        "team-event-type",
        "unknown-event-type",
      ],
    });
    expect(bookingsRepository.updateByUids).not.toHaveBeenCalled();
  });

  it("rejects the request with every uid whose target slot is not free and changes nothing", async () => {
    const uids = ["outside", "busy", "pair-a", "pair-b", "blocked", "no-schedule", "free"];
    bookingsRepository.getByUids.mockResolvedValue([
      ...uids.map((uid) =>
        booking(uid, new Date("2030-01-02T10:00:00.000Z"), new Date("2030-01-02T10:30:00.000Z"))
      ),
      booking("noop", date("16:00"), date("16:30"), { userId: 1, eventTypeId: 100 }),
    ]);
    bookingsRepository.getByUserIdsAndStatusesInRange.mockResolvedValue([
      booking("other", date("12:00"), date("13:00"), { userId: 1 }),
    ]);

    const error = await catchError(
      service.bulkReschedule([
        item("outside", "08:45"),
        item("busy", "12:15"),
        item("pair-a", "14:00", { lengthInMinutes: 60 }),
        item("pair-b", "14:30"),
        item("blocked", "16:15"),
        item("noop", "16:00"),
        item("no-schedule", "10:00", { eventTypeId: 200 }),
        item("free", "10:00"),
      ])
    );

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.name).toBe("bulk_reschedule_conflict");
    expect(error.getResponse()).toEqual({
      uids: ["outside", "busy", "pair-a", "pair-b", "blocked", "no-schedule"],
    });
    expect(bookingsRepository.updateByUids).not.toHaveBeenCalled();
  });
});
