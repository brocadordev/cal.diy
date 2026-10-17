// Stub the injected classes so the tests do not load Prisma and the platform libraries.
jest.mock("@/modules/admin-users/services/admin-users.service", () => ({ AdminUsersService: class {} }));
jest.mock("@/modules/users/users.repository", () => ({ UsersRepository: class {} }));

import { SUCCESS_STATUS } from "@calcom/platform-constants";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AdminUsersController } from "@/modules/admin-users/controllers/admin-users.controller";
import { AdminUsersService } from "@/modules/admin-users/services/admin-users.service";
import { AdminApiKeyGuard } from "@/modules/auth/guards/admin-api-key/admin-api-key.guard";
import { UsersRepository } from "@/modules/users/users.repository";

const user = {
  id: 7,
  email: "alice@example.com",
  username: "alice-example.com",
  name: "Alice",
  bio: null,
  timeZone: "Europe/London",
  weekStart: "Sunday",
  createdDate: new Date("2026-01-01T00:00:00.000Z"),
  timeFormat: 24,
  defaultScheduleId: 3,
  locale: "en",
  avatarUrl: null,
  metadata: { chatbotUserId: "chatbot-7" },
  role: "USER",
};

describe("AdminUsersController", () => {
  let controller: AdminUsersController;
  const usersRepository = {
    findById: jest.fn(),
    findByChatbotUserId: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const adminUsersService = { createUser: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        { provide: UsersRepository, useValue: usersRepository },
        { provide: AdminUsersService, useValue: adminUsersService },
      ],
    })
      .overrideGuard(AdminApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminUsersController);
  });

  describe("createUser", () => {
    it("rejects a body without metadata.chatbotUserId", async () => {
      await expect(controller.createUser({ email: user.email, name: "Alice" })).rejects.toThrow(
        BadRequestException
      );
      expect(adminUsersService.createUser).not.toHaveBeenCalled();
    });

    it("creates the user and returns only the public fields", async () => {
      adminUsersService.createUser.mockResolvedValue(user);
      const body = { email: user.email, name: "Alice", metadata: { chatbotUserId: "chatbot-7" } };

      const result = await controller.createUser(body);

      expect(adminUsersService.createUser).toHaveBeenCalledWith(body);
      expect(result.status).toBe(SUCCESS_STATUS);
      expect(result.data).toMatchObject({
        id: 7,
        email: user.email,
        defaultScheduleId: 3,
        metadata: { chatbotUserId: "chatbot-7" },
      });
      expect(result.data).not.toHaveProperty("role");
    });
  });

  describe("getUser", () => {
    it("returns the user", async () => {
      usersRepository.findById.mockResolvedValue(user);

      const result = await controller.getUser(7);

      expect(usersRepository.findById).toHaveBeenCalledWith(7);
      expect(result.data).toMatchObject({ id: 7, metadata: { chatbotUserId: "chatbot-7" } });
    });

    it("throws NotFoundException when the user does not exist", async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(controller.getUser(404)).rejects.toThrow(NotFoundException);
    });
  });

  describe("getUserByChatbotUserId", () => {
    it("rejects a missing or empty chatbotUserId", async () => {
      await expect(controller.getUserByChatbotUserId(undefined)).rejects.toThrow(BadRequestException);
      await expect(controller.getUserByChatbotUserId("")).rejects.toThrow(BadRequestException);
      expect(usersRepository.findByChatbotUserId).not.toHaveBeenCalled();
    });

    it("returns the user", async () => {
      usersRepository.findByChatbotUserId.mockResolvedValue([user]);

      const result = await controller.getUserByChatbotUserId("chatbot-7");

      expect(usersRepository.findByChatbotUserId).toHaveBeenCalledWith("chatbot-7");
      expect(result.status).toBe(SUCCESS_STATUS);
      expect(result.data).toMatchObject({ id: 7, metadata: { chatbotUserId: "chatbot-7" } });
      expect(result.data).not.toHaveProperty("role");
    });

    it("throws NotFoundException when no user matches", async () => {
      usersRepository.findByChatbotUserId.mockResolvedValue([]);

      await expect(controller.getUserByChatbotUserId("chatbot-404")).rejects.toThrow(NotFoundException);
    });

    it("throws ConflictException when more than one user matches", async () => {
      usersRepository.findByChatbotUserId.mockResolvedValue([user, { ...user, id: 8 }]);

      await expect(controller.getUserByChatbotUserId("chatbot-7")).rejects.toThrow(ConflictException);
    });
  });

  describe("updateUser", () => {
    it("rejects new metadata without chatbotUserId", async () => {
      await expect(controller.updateUser(7, { metadata: { plan: "pro" } })).rejects.toThrow(
        BadRequestException
      );
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it("updates the user", async () => {
      usersRepository.update.mockResolvedValue({ ...user, name: "Bob" });

      const result = await controller.updateUser(7, { name: "Bob" });

      expect(usersRepository.update).toHaveBeenCalledWith(7, { name: "Bob" });
      expect(result.data).toMatchObject({ id: 7, name: "Bob" });
    });
  });

  describe("deleteUser", () => {
    it("deletes the user and returns it", async () => {
      usersRepository.delete.mockResolvedValue(user);

      const result = await controller.deleteUser(7);

      expect(usersRepository.delete).toHaveBeenCalledWith(7);
      expect(result).toMatchObject({ status: SUCCESS_STATUS, data: { id: 7 } });
    });
  });
});
