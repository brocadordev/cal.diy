// Stub the dependencies so the test does not load Prisma and the platform libraries.
jest.mock("@calcom/platform-libraries", () => ({}), { virtual: true });
jest.mock("@calcom/platform-libraries/bookings", () => ({}), { virtual: true });
jest.mock("@/lib/services/recurring-booking.service", () => ({}));
jest.mock("@/lib/services/regular-booking.service", () => ({}));
jest.mock("@/modules/auth/decorators/get-optional-user/get-optional-user.decorator", () => ({}));
jest.mock("@/modules/auth/strategies/api-auth/api-auth.strategy", () => ({}));
jest.mock("@/modules/booking-seat/booking-seat.repository", () => ({}));
jest.mock("@/modules/event-types/services/event-type-access.service", () => ({}));
jest.mock("@/modules/kysely/kysely-read.service", () => ({}));
jest.mock("@/modules/oauth-clients/oauth-client.repository", () => ({}));
jest.mock("@/modules/oauth-clients/services/oauth-clients-users.service", () => ({}));
jest.mock("@/modules/prisma/prisma-read.service", () => ({}));
jest.mock("@/modules/teams/event-types/teams-event-types.repository", () => ({}));
jest.mock("@/modules/teams/teams/teams.repository", () => ({}));
jest.mock("@/modules/users/services/users.service", () => ({}));
jest.mock("@/modules/users/users.repository", () => ({}));
jest.mock("@/platform/bookings/2024-08-13/outputs/calendar-links.output", () => ({}));
jest.mock("@/platform/bookings/2024-08-13/repositories/bookings.repository", () => ({}));
jest.mock("@/platform/bookings/2024-08-13/services/input.service", () => ({}));
jest.mock("@/platform/bookings/2024-08-13/services/output.service", () => ({}));
jest.mock("@/platform/bookings/shared/platform-bookings.service", () => ({}));
jest.mock("@/platform/event-types/event-types_2024_06_14/event-types.repository", () => ({}));

import type { Request } from "express";
import { BadRequestException } from "@nestjs/common";
import { BookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/bookings.service";
import { ErrorsBookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/errors.service";

describe("BookingsService_2024_08_13 reschedule to another event type", () => {
  const createBookingError = new Error("createBooking reached");
  const setup = (targetEventTypeId: number) => {
    const getEventTypeByIdWithOwnerAndTeam = jest.fn(async (id: number) => ({
      id,
      schedulingType: "MANAGED",
      bookingRequiresAuthentication: false,
    }));
    const createBooking = jest.fn(async () => {
      throw createBookingError;
    });
    const service: BookingsService_2024_08_13 = Object.assign(
      Object.create(BookingsService_2024_08_13.prototype),
      {
        shouldRescheduleIndividualSeat: async () => false,
        inputService: {
          createRescheduleBookingRequest: async () => ({ body: { eventTypeId: targetEventTypeId } }),
        },
        bookingsRepository: { getByUid: async () => ({ eventTypeId: 1, status: "ACCEPTED" }) },
        eventTypesRepository: { getEventTypeByIdWithOwnerAndTeam },
        regularBookingService: { createBooking },
        errorsBookingsService: new ErrorsBookingsService_2024_08_13(),
      }
    );
    const reschedule = () =>
      service.rescheduleBooking({} as Request, "booking-uid", { start: "2027-01-04T13:00:00Z" }, null);
    return { reschedule, getEventTypeByIdWithOwnerAndTeam, createBooking };
  };

  it("runs the booking checks of the new event type", async () => {
    const { reschedule, createBooking } = setup(2);

    await expect(reschedule()).rejects.toThrow(BadRequestException);
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("skips the checks when the event type does not change", async () => {
    const { reschedule, getEventTypeByIdWithOwnerAndTeam } = setup(1);

    await expect(reschedule()).rejects.toBe(createBookingError);
    expect(getEventTypeByIdWithOwnerAndTeam).not.toHaveBeenCalled();
  });
});
