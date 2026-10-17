// Stub the dependencies so the test does not load Prisma and the platform libraries.
jest.mock("@calcom/platform-libraries", () => ({ slugify: jest.fn(() => "alice-example.com") }), {
  virtual: true,
});
jest.mock("@/platform/schedules/schedules_2024_06_11/services/schedules.service", () => ({
  SchedulesService_2024_06_11: class {},
}));
jest.mock("@/platform/schedules/schedules_2024_06_11/schedules.repository", () => ({
  SchedulesRepository_2024_06_11: class {},
}));
jest.mock("@/platform/schedules/schedules_2024_06_11/services/output-schedules.service", () => ({
  OutputSchedulesService_2024_06_11: class {},
}));
jest.mock("@/platform/bookings/2024-08-13/repositories/bookings.repository", () => ({
  BookingsRepository_2024_08_13: class {},
}));
jest.mock("@/modules/users/users.repository", () => ({ UsersRepository: class {} }));

import { BadRequestException, HttpException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AdminUsersService } from "@/modules/admin-users/services/admin-users.service";
import { UsersRepository } from "@/modules/users/users.repository";
import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";
import { SchedulesRepository_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/schedules.repository";
import { OutputSchedulesService_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/services/output-schedules.service";
import { SchedulesService_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/services/schedules.service";

describe("AdminUsersService", () => {
  let service: AdminUsersService;
  const usersRepository = { create: jest.fn(), findByIdsWithEventTypes: jest.fn() };
  const schedulesService = { createUserDefaultSchedule: jest.fn() };
  const schedulesRepository = { getSchedulesByIds: jest.fn() };
  const outputSchedulesService = { getResponseSchedules: jest.fn() };
  const bookingsRepository = { getByUserIdsAndStatusesInRange: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: UsersRepository, useValue: usersRepository },
        { provide: SchedulesService_2024_06_11, useValue: schedulesService },
        { provide: SchedulesRepository_2024_06_11, useValue: schedulesRepository },
        { provide: OutputSchedulesService_2024_06_11, useValue: outputSchedulesService },
        { provide: BookingsRepository_2024_08_13, useValue: bookingsRepository },
      ],
    }).compile();
    service = module.get(AdminUsersService);
  });

  it("creates the user with the pt-BR locale and a default schedule in the user time zone", async () => {
    usersRepository.create.mockResolvedValue({
      id: 7,
      timeZone: "America/Sao_Paulo",
      defaultScheduleId: null,
    });
    schedulesService.createUserDefaultSchedule.mockResolvedValue({ id: 3 });
    const body = { email: "alice@example.com", name: "Alice", metadata: { chatbotUserId: "chatbot-7" } };

    const user = await service.createUser(body);

    expect(usersRepository.create).toHaveBeenCalledWith({ ...body, locale: "pt-BR" }, "alice-example.com");
    expect(schedulesService.createUserDefaultSchedule).toHaveBeenCalledWith(7, "America/Sao_Paulo");
    expect(user.defaultScheduleId).toBe(3);
  });

  describe("getBulkCalendars", () => {
    const availability = [{ days: ["Monday"], startTime: "09:00", endTime: "18:00" }];
    const users = [
      { id: 19, timeZone: "UTC", defaultScheduleId: null, eventTypes: [] },
      {
        id: 20,
        timeZone: "America/Sao_Paulo",
        defaultScheduleId: 5,
        eventTypes: [{ id: 123, slug: "consulta", length: 45, hidden: true }],
      },
    ];

    it("returns the calendar of each user in the request order", async () => {
      const createdAt = new Date("2026-10-01T00:00:00.000Z");
      usersRepository.findByIdsWithEventTypes.mockResolvedValue(users);
      schedulesRepository.getSchedulesByIds.mockResolvedValue([{ id: 5, userId: 20 }]);
      outputSchedulesService.getResponseSchedules.mockResolvedValue([{ ownerId: 20, availability }]);
      bookingsRepository.getByUserIdsAndStatusesInRange.mockResolvedValue([
        {
          uid: "booking-1",
          userId: 20,
          eventTypeId: null,
          startTime: new Date("2026-10-12T12:00:00.000Z"),
          endTime: new Date("2026-10-12T12:45:00.000Z"),
          status: "CANCELLED",
          rescheduled: true,
          fromReschedule: "booking-0",
          createdAt,
          updatedAt: null,
        },
      ]);

      const calendars = await service.getBulkCalendars({ userIds: [20, 19], start: "2026-10-12T00:00:00Z" });

      expect(schedulesRepository.getSchedulesByIds).toHaveBeenCalledWith([5], 0, 1);
      expect(bookingsRepository.getByUserIdsAndStatusesInRange).toHaveBeenCalledWith(
        [20, 19],
        ["ACCEPTED", "CANCELLED"],
        new Date("2026-10-12T00:00:00.000Z"),
        undefined
      );
      expect(calendars).toEqual([
        {
          userId: 20,
          timeZone: "America/Sao_Paulo",
          availability,
          eventTypes: [{ id: 123, slug: "consulta", lengthInMinutes: 45 }],
          bookings: [
            {
              uid: "booking-1",
              eventTypeId: null,
              start: new Date("2026-10-12T12:00:00.000Z"),
              end: new Date("2026-10-12T12:45:00.000Z"),
              status: "cancelled",
              rescheduled: true,
              fromReschedule: "booking-0",
              createdAt,
              updatedAt: null,
            },
          ],
        },
        { userId: 19, timeZone: "UTC", availability: [], eventTypes: [], bookings: [] },
      ]);
    });

    it("rejects the request with every unknown user id", async () => {
      usersRepository.findByIdsWithEventTypes.mockResolvedValue([users[1]]);

      const error: HttpException = await service
        .getBulkCalendars({ userIds: [20, 21, 22], start: "2026-10-12T00:00:00Z" })
        .catch((error) => error);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.name).toBe("bulk_calendars_invalid");
      expect(error.getResponse()).toEqual({ userIds: [21, 22] });
      expect(bookingsRepository.getByUserIdsAndStatusesInRange).not.toHaveBeenCalled();
    });
  });
});
