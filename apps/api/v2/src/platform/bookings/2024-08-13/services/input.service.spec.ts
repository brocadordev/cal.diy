// Stub the dependencies so the test does not load Prisma and the platform libraries.
jest.mock("@calcom/platform-libraries", () => ({}), { virtual: true });
jest.mock(
  "@calcom/platform-libraries/event-types",
  () => ({ EventTypeMetaDataSchema: { parse: () => null } }),
  { virtual: true }
);
jest.mock("@calcom/platform-libraries/schedules", () => ({ getWorkingHoursInMillis: jest.fn() }), {
  virtual: true,
});
jest.mock("@/lib/api-key", () => ({}));
jest.mock("@/modules/api-keys/api-keys-repository", () => ({}));
jest.mock("@/modules/booking-seat/booking-seat.repository", () => ({}));
jest.mock("@/modules/oauth-clients/services/oauth-clients-users.service", () => ({}));
jest.mock("@/modules/oauth-clients/services/oauth-flow.service", () => ({}));
jest.mock("@/modules/users/users.repository", () => ({}));
jest.mock("@/platform/bookings/2024-08-13/repositories/bookings.repository", () => ({}));
jest.mock("@/platform/bookings/2024-08-13/services/bookings.service", () => ({}));
jest.mock("@/platform/bookings/2024-08-13/services/output.service", () => {
  const { z } = jest.requireActual<typeof import("zod")>("zod");
  return { bookingResponsesSchema: z.object({ name: z.string(), email: z.string() }).passthrough() };
});
jest.mock("@/platform/bookings/shared/platform-bookings.service", () => ({}));
jest.mock("@/platform/event-types/event-types_2024_06_14/event-types.repository", () => ({}));
jest.mock("@/platform/event-types/event-types_2024_06_14/services/output-event-types.service", () => ({}));
jest.mock("@/platform/event-types/event-types_2024_06_14/transformers", () => ({}));
jest.mock("@/platform/schedules/schedules_2024_04_15/schedules.repository", () => ({}));

import { FrequencyInput } from "@calcom/platform-enums";
import { getWorkingHoursInMillis } from "@calcom/platform-libraries/schedules";
import type {
  CreateRecurringBookingInput_2024_08_13,
  RescheduleBookingInput_2024_08_13,
} from "@calcom/platform-types";
import { BadRequestException } from "@nestjs/common";
import type { EventTypeWithOwnerAndTeam } from "@/platform/bookings/2024-08-13/services/bookings.service";
import { InputBookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/input.service";

describe("InputBookingsService_2024_08_13 recurrence", () => {
  const timeZone = "America/Sao_Paulo";
  const eventType = {
    id: 1,
    length: 60,
    recurringEvent: null,
    scheduleId: null,
    schedulingType: null,
    owner: { id: 7, timeZone, defaultScheduleId: 5 },
  } as unknown as EventTypeWithOwnerAndTeam;
  const getHolidays = jest.fn().mockResolvedValue([]);
  const service: InputBookingsService_2024_08_13 = Object.assign(
    Object.create(InputBookingsService_2024_08_13.prototype),
    {
      schedulesRepository: { getScheduleById: async () => ({ timeZone, availability: [] }) },
      bookingsRepository: { getByUserIdsAndStatusesInRange: getHolidays },
    }
  );
  const millis = (iso: string) => new Date(iso).getTime();
  const attendee = { name: "Ana", email: "ana@example.com", timeZone: "Europe/Lisbon" };

  const transform = (start: string, frequency: FrequencyInput, count: number) =>
    service.transformInputCreateRecurringBooking(
      {
        start,
        eventTypeId: 1,
        attendee,
        metadata: { chatbotBookingId: "b-1" },
        recurrence: { frequency, count },
      } as CreateRecurringBookingInput_2024_08_13,
      eventType
    );

  it("keeps the day of the month and uses the last day when a month is shorter", async () => {
    jest.mocked(getWorkingHoursInMillis).mockReturnValue([{ start: 0, end: millis("2028-01-01") }]);

    const events = await transform("2027-01-31T18:00:00Z", FrequencyInput.monthly, 4);

    expect(events.map((event) => event.start)).toEqual([
      "2027-01-31T15:00:00.000-03:00",
      "2027-02-28T15:00:00.000-03:00",
      "2027-03-31T15:00:00.000-03:00",
      "2027-04-30T15:00:00.000-03:00",
    ]);
    expect(new Set(events.map((event) => event.recurringEventId)).size).toBe(1);
    expect(events.every((event) => event.metadata.chatbotBookingId === "b-1")).toBe(true);
  });

  it("removes the dates outside the working hours but never the first date", async () => {
    // Friday and Sunday until 18:00, Saturday until 12:00.
    jest.mocked(getWorkingHoursInMillis).mockReturnValue([
      { start: millis("2027-01-01T12:00:00Z"), end: millis("2027-01-01T21:00:00Z") },
      { start: millis("2027-01-02T12:00:00Z"), end: millis("2027-01-02T15:00:00Z") },
      { start: millis("2027-01-03T12:00:00Z"), end: millis("2027-01-03T21:00:00Z") },
    ]);

    const fromFriday = await transform("2027-01-01T18:00:00Z", FrequencyInput.daily, 3);
    const fromSaturday = await transform("2027-01-02T18:00:00Z", FrequencyInput.daily, 2);

    expect(fromFriday.map((event) => event.start)).toEqual([
      "2027-01-01T15:00:00.000-03:00",
      "2027-01-03T15:00:00.000-03:00",
    ]);
    expect(fromSaturday).toHaveLength(2);
  });

  it("removes the dates with a holiday block for each frequency but fails on a holiday on the first date", async () => {
    jest.mocked(getWorkingHoursInMillis).mockReturnValue([{ start: 0, end: millis("2028-01-01") }]);
    const holiday = {
      startTime: new Date("2027-01-15T03:00:00Z"),
      endTime: new Date("2027-01-16T03:00:00Z"),
    };
    getHolidays.mockResolvedValue([holiday]);

    const weekly = await transform("2027-01-08T18:00:00Z", FrequencyInput.weekly, 3);
    const daily = await transform("2027-01-14T18:00:00Z", FrequencyInput.daily, 3);

    expect(weekly.map((event) => event.start)).toEqual([
      "2027-01-08T15:00:00.000-03:00",
      "2027-01-22T15:00:00.000-03:00",
    ]);
    expect(daily.map((event) => event.start)).toEqual([
      "2027-01-14T15:00:00.000-03:00",
      "2027-01-16T15:00:00.000-03:00",
    ]);
    expect(getHolidays).toHaveBeenCalledWith(
      [7],
      ["ACCEPTED"],
      new Date("2027-01-08T18:00:00Z"),
      new Date("2027-01-22T19:00:00Z"),
      { key: "chatbotHoliday", equals: "true" }
    );
    await expect(transform("2027-01-15T18:00:00Z", FrequencyInput.monthly, 2)).rejects.toThrow(
      "no_available_users_found_error"
    );
    getHolidays.mockResolvedValue([]);
  });

  it("keeps the attendee time zone and all the dates for a recurrence of the event type", async () => {
    jest.mocked(getWorkingHoursInMillis).mockClear();
    // A monthly recurrence of 3 dates.
    const monthlyEventType = { ...eventType, recurringEvent: { freq: 1, count: 3, interval: 1 } };

    const events = await service.transformInputCreateRecurringBooking(
      { start: "2027-01-31T18:00:00Z", eventTypeId: 1, attendee } as CreateRecurringBookingInput_2024_08_13,
      monthlyEventType as EventTypeWithOwnerAndTeam
    );

    expect(events.map((event) => event.start)).toEqual([
      "2027-01-31T18:00:00.000+00:00",
      "2027-02-28T18:00:00.000+00:00",
      "2027-03-31T18:00:00.000+01:00",
    ]);
    expect(getWorkingHoursInMillis).not.toHaveBeenCalled();
  });

  it("rejects recurrence together with recurrenceCount", async () => {
    await expect(
      service.transformInputCreateRecurringBooking(
        {
          start: "2027-01-31T18:00:00Z",
          eventTypeId: 1,
          attendee,
          recurrence: { frequency: FrequencyInput.daily, count: 2 },
          recurrenceCount: 2,
        } as CreateRecurringBookingInput_2024_08_13,
        eventType
      )
    ).rejects.toThrow(BadRequestException);
  });
});

describe("InputBookingsService_2024_08_13 reschedule", () => {
  const booking = {
    eventTypeId: 1,
    responses: { name: "Ana", email: "ana@example.com", notes: "Old notes" },
    attendees: [
      {
        name: "Ana",
        email: "ana@example.com",
        timeZone: "America/Sao_Paulo",
        locale: "pt-BR",
        phoneNumber: null,
      },
    ],
    metadata: { chatbotBookingId: "b-1" },
  };
  const eventTypes: Record<number, { id: number; length: number; seatsPerTimeSlot: null }> = {
    1: { id: 1, length: 60, seatsPerTimeSlot: null },
    2: { id: 2, length: 30, seatsPerTimeSlot: null },
  };
  const service: InputBookingsService_2024_08_13 = Object.assign(
    Object.create(InputBookingsService_2024_08_13.prototype),
    {
      bookingsRepository: { getByUidWithAttendeesAndUserAndEvent: async () => booking },
      eventTypesRepository: { getEventTypeByIdWithOwnerAndTeam: async (id: number) => eventTypes[id] },
    }
  );
  const reschedule = (input: Partial<RescheduleBookingInput_2024_08_13>) =>
    service.transformInputRescheduleBooking(
      "booking-uid",
      { start: "2027-01-04T13:00:00Z", ...input } as RescheduleBookingInput_2024_08_13,
      false
    );

  it("uses the length of the event type when no length is given", async () => {
    const sameEventType = await reschedule({});
    const otherEventType = await reschedule({ eventTypeId: 2 });

    expect(sameEventType).toMatchObject({ eventTypeId: 1, end: "2027-01-04T11:00:00.000-03:00" });
    expect(otherEventType).toMatchObject({ eventTypeId: 2, end: "2027-01-04T10:30:00.000-03:00" });
  });

  it("uses the given length and adds the booking field responses without changing the old ones", async () => {
    const result = await reschedule({
      eventTypeId: 2,
      lengthInMinutes: 45,
      bookingFieldsResponses: { notes: "New notes", company: "Acme" },
    });

    expect(result).toMatchObject({ eventTypeId: 2, end: "2027-01-04T10:45:00.000-03:00" });
    expect(result.responses).toMatchObject({ name: "Ana", notes: "Old notes", company: "Acme" });
  });
});
