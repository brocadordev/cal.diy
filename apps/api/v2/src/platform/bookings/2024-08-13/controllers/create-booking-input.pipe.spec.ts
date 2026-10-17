import type { CreateBookingInput } from "@calcom/platform-types";
import { CreateBookingInputPipe, CreateRecurringBookingInput_2024_08_13 } from "@calcom/platform-types";
import { BadRequestException } from "@nestjs/common";

describe("CreateBookingInputPipe recurrence", () => {
  const pipe = new CreateBookingInputPipe();
  const body = (recurrence: unknown) =>
    ({
      start: "2027-01-04T13:00:00Z",
      eventTypeId: 1,
      attendee: { name: "Ana", email: "ana@example.com", timeZone: "America/Sao_Paulo" },
      recurrence,
    }) as unknown as CreateBookingInput;

  it("reads a body with recurrence as a recurring booking", () => {
    const result = pipe.transform(body({ frequency: "daily", count: 366 }));

    expect(result).toBeInstanceOf(CreateRecurringBookingInput_2024_08_13);
    expect(result).toMatchObject({ recurrence: { frequency: "daily", count: 366 } });
  });

  it.each([
    { frequency: "daily", count: 1 },
    { frequency: "daily", count: 367 },
    { frequency: "yearly", count: 2 },
  ])("rejects the recurrence %j", (recurrence) => {
    expect(() => pipe.transform(body(recurrence))).toThrow(BadRequestException);
  });
});
