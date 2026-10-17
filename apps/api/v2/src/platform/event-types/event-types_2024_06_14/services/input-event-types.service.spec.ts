import { CalendarsService } from "@/platform/calendars/services/calendars.service";
import { EventTypesRepository_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/event-types.repository";
import { InputEventTypesService_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/services/input-event-types.service";

describe("InputEventTypesService_2024_06_14 chatbotServiceId metadata", () => {
  const eventTypesRepository = { getEventTypeWithMetaData: jest.fn() };
  const service = new InputEventTypesService_2024_06_14(
    eventTypesRepository as unknown as EventTypesRepository_2024_06_14,
    {} as CalendarsService
  );

  it("adds chatbotServiceId to the metadata of a new event type", () => {
    const eventType = service.transformInputCreateEventType({
      title: "Haircut",
      slug: "service-1",
      lengthInMinutes: 30,
      lengthInMinutesOptions: [30, 60],
      metadata: { chatbotServiceId: "service-1" },
    });

    expect(eventType.metadata).toMatchObject({ chatbotServiceId: "service-1", multipleDuration: [30, 60] });
  });

  it("keeps the stored chatbotServiceId when the update has no metadata", async () => {
    eventTypesRepository.getEventTypeWithMetaData.mockResolvedValue({
      metadata: { chatbotServiceId: "service-1", multipleDuration: [30, 60] },
    });

    const eventType = await service.transformInputUpdateEventType({ title: "Beard" }, 3);

    expect(eventType.metadata).toEqual({ chatbotServiceId: "service-1", multipleDuration: [30, 60] });
  });

  it("replaces the stored chatbotServiceId and keeps the other stored keys", async () => {
    eventTypesRepository.getEventTypeWithMetaData.mockResolvedValue({
      metadata: { chatbotServiceId: "service-1", multipleDuration: [30, 60] },
    });

    const eventType = await service.transformInputUpdateEventType(
      { metadata: { chatbotServiceId: "service-2" } },
      3
    );

    expect(eventType.metadata).toEqual({ chatbotServiceId: "service-2", multipleDuration: [30, 60] });
  });
});
