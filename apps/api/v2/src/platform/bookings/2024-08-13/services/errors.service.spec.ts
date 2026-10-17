import { BadRequestException } from "@nestjs/common";
import { ErrorsBookingsService_2024_08_13 } from "@/platform/bookings/2024-08-13/services/errors.service";

describe("ErrorsBookingsService_2024_08_13", () => {
  it("gives a 400 with the occurrence_unavailable code when an occurrence is not available", () => {
    let thrown: unknown;
    try {
      new ErrorsBookingsService_2024_08_13().handleBookingError(new Error("occurrence_unavailable"), false);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    // The exception filter returns the exception name as error.code.
    expect((thrown as BadRequestException).name).toBe("occurrence_unavailable");
    expect((thrown as BadRequestException).getStatus()).toBe(400);
  });
});
