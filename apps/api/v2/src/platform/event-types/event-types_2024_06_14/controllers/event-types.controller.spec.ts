// Stub the injected classes so the tests do not load Prisma and the platform libraries.
jest.mock("@/platform/event-types/event-types_2024_06_14/services/event-types.service", () => ({
  EventTypesService_2024_06_14: class {},
}));
jest.mock("@/platform/event-types/event-types_2024_06_14/services/input-event-types.service", () => ({
  InputEventTypesService_2024_06_14: class {},
}));
jest.mock("@/platform/event-types/event-types_2024_06_14/services/output-event-types.service", () => ({
  OutputEventTypesService_2024_06_14: class {},
}));
jest.mock("@/platform/event-types/event-types_2024_06_14/pipes/event-type-response.transformer", () => ({
  EventTypeResponseTransformPipe: class {},
}));
jest.mock("@/modules/teams/event-types/pipes/output-team-event-types-response.pipe", () => ({
  OutputTeamEventTypesResponsePipe: class {},
}));

import { SUCCESS_STATUS } from "@calcom/platform-constants";
import { BadRequestException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ApiAuthGuard } from "@/modules/auth/guards/api-auth/api-auth.guard";
import { OptionalApiAuthGuard } from "@/modules/auth/guards/optional-api-auth/optional-api-auth.guard";
import { PermissionsGuard } from "@/modules/auth/guards/permissions/permissions.guard";
import { OutputTeamEventTypesResponsePipe } from "@/modules/teams/event-types/pipes/output-team-event-types-response.pipe";
import type { UserWithProfile } from "@/modules/users/users.repository";
import { EventTypesController_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/controllers/event-types.controller";
import { EventTypeResponseTransformPipe } from "@/platform/event-types/event-types_2024_06_14/pipes/event-type-response.transformer";
import { EventTypesService_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/services/event-types.service";
import { InputEventTypesService_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/services/input-event-types.service";
import { OutputEventTypesService_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/services/output-event-types.service";

const user = { id: 7 } as UserWithProfile;
const body = { title: "Haircut", slug: "service-1", lengthInMinutes: 30 };
const eventType = { id: 3, metadata: { chatbotServiceId: "service-1" } };

describe("EventTypesController_2024_06_14", () => {
  let controller: EventTypesController_2024_06_14;
  const eventTypesService = { createUserEventType: jest.fn(), updateEventType: jest.fn() };
  const inputEventTypesService = {
    transformAndValidateCreateEventTypeInput: jest.fn(),
    transformAndValidateUpdateEventTypeInput: jest.fn(),
  };
  const eventTypeResponseTransformPipe = { transform: jest.fn((value) => value) };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [EventTypesController_2024_06_14],
      providers: [
        { provide: EventTypesService_2024_06_14, useValue: eventTypesService },
        { provide: InputEventTypesService_2024_06_14, useValue: inputEventTypesService },
        { provide: EventTypeResponseTransformPipe, useValue: eventTypeResponseTransformPipe },
        { provide: OutputEventTypesService_2024_06_14, useValue: {} },
        { provide: OutputTeamEventTypesResponsePipe, useValue: {} },
      ],
    })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ApiAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OptionalApiAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(EventTypesController_2024_06_14);
  });

  describe("createEventType", () => {
    it("rejects a body without metadata.chatbotServiceId", async () => {
      await expect(controller.createEventType(body, user)).rejects.toThrow(BadRequestException);
      await expect(controller.createEventType({ ...body, metadata: {} }, user)).rejects.toThrow(
        BadRequestException
      );
      expect(inputEventTypesService.transformAndValidateCreateEventTypeInput).not.toHaveBeenCalled();
    });

    it("creates the event type", async () => {
      const bodyWithMetadata = { ...body, metadata: { chatbotServiceId: "service-1" } };
      inputEventTypesService.transformAndValidateCreateEventTypeInput.mockResolvedValue(bodyWithMetadata);
      eventTypesService.createUserEventType.mockResolvedValue(eventType);

      const result = await controller.createEventType(bodyWithMetadata, user);

      expect(inputEventTypesService.transformAndValidateCreateEventTypeInput).toHaveBeenCalledWith(
        user,
        bodyWithMetadata
      );
      expect(result).toEqual({ status: SUCCESS_STATUS, data: eventType });
    });
  });

  describe("updateEventType", () => {
    it("rejects new metadata without chatbotServiceId", async () => {
      await expect(controller.updateEventType(3, { metadata: {} }, user)).rejects.toThrow(
        BadRequestException
      );
      expect(inputEventTypesService.transformAndValidateUpdateEventTypeInput).not.toHaveBeenCalled();
    });

    it("updates the event type without metadata", async () => {
      inputEventTypesService.transformAndValidateUpdateEventTypeInput.mockResolvedValue({ title: "Beard" });
      eventTypesService.updateEventType.mockResolvedValue(eventType);

      const result = await controller.updateEventType(3, { title: "Beard" }, user);

      expect(eventTypesService.updateEventType).toHaveBeenCalledWith(3, { title: "Beard" }, user);
      expect(result).toEqual({ status: SUCCESS_STATUS, data: eventType });
    });
  });
});
