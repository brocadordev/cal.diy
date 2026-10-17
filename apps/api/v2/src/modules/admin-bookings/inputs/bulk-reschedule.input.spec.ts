import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { BulkRescheduleInput } from "@/modules/admin-bookings/inputs/bulk-reschedule.input";

const getErrors = async (body: object) => validate(plainToInstance(BulkRescheduleInput, body));
const item = { uid: "booking-1", eventTypeId: 100, start: "2030-01-07T10:00:00Z" };

describe("BulkRescheduleInput", () => {
  it("accepts items with and without lengthInMinutes", async () => {
    expect(await getErrors({ items: [item, { ...item, uid: "booking-2", lengthInMinutes: 45 }] })).toEqual(
      []
    );
  });

  it.each([
    ["no items", { items: [] }],
    ["an item without eventTypeId", { items: [{ uid: "booking-1", start: item.start }] }],
    ["an empty uid", { items: [{ ...item, uid: "" }] }],
    ["a start that is not ISO 8601", { items: [{ ...item, start: "tomorrow" }] }],
    ["a zero length", { items: [{ ...item, lengthInMinutes: 0 }] }],
  ])("rejects %s", async (_, body) => {
    expect(await getErrors(body)).not.toEqual([]);
  });
});
