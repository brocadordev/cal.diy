import { SUCCESS_STATUS } from "@calcom/platform-constants";
import type { User } from "@calcom/prisma/client";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags as DocsTags } from "@nestjs/swagger";
import { plainToInstance } from "class-transformer";
import { API_VERSIONS_VALUES } from "@/lib/api-versions";
import { BulkCalendarsInput } from "@/modules/admin-users/inputs/bulk-calendars.input";
import { AdminUsersService } from "@/modules/admin-users/services/admin-users.service";
import { AdminApiKeyGuard } from "@/modules/auth/guards/admin-api-key/admin-api-key.guard";
import { GetManagedUserOutput } from "@/modules/oauth-clients/controllers/oauth-client-users/outputs/get-managed-user.output";
import { ManagedUserOutput } from "@/modules/oauth-clients/controllers/oauth-client-users/outputs/managed-user.output";
import { CreateManagedUserInput } from "@/modules/users/inputs/create-managed-user.input";
import { UpdateManagedUserInput } from "@/modules/users/inputs/update-managed-user.input";
import { UsersRepository } from "@/modules/users/users.repository";

const CHATBOT_USER_ID_REQUIRED = "metadata.chatbotUserId is required";

@Controller({
  path: "/v2/users",
  version: API_VERSIONS_VALUES,
})
@UseGuards(AdminApiKeyGuard)
@DocsTags("Users")
export class AdminUsersController {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly adminUsersService: AdminUsersService
  ) {}

  @Post("/")
  @ApiOperation({ summary: "Create a user with a default schedule" })
  async createUser(@Body() body: CreateManagedUserInput): Promise<GetManagedUserOutput> {
    if (!body.metadata?.chatbotUserId) {
      throw new BadRequestException(CHATBOT_USER_ID_REQUIRED);
    }

    const user = await this.adminUsersService.createUser(body);

    return { status: SUCCESS_STATUS, data: this.toOutput(user) };
  }

  @Post("/bulk-calendars")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get the schedule, event types and bookings of many users" })
  async getBulkCalendars(@Body() body: BulkCalendarsInput) {
    return { status: SUCCESS_STATUS, data: await this.adminUsersService.getBulkCalendars(body) };
  }

  @Get("/")
  @ApiOperation({ summary: "Get a user by chatbotUserId" })
  async getUserByChatbotUserId(
    @Query("chatbotUserId") chatbotUserId?: string
  ): Promise<GetManagedUserOutput> {
    if (!chatbotUserId) {
      throw new BadRequestException("chatbotUserId query parameter is required");
    }

    const users = await this.usersRepository.findByChatbotUserId(chatbotUserId);
    if (!users.length) {
      throw new NotFoundException(`User with chatbotUserId ${chatbotUserId} not found`);
    }
    if (users.length > 1) {
      throw new ConflictException(`More than one user has chatbotUserId ${chatbotUserId}`);
    }

    return { status: SUCCESS_STATUS, data: this.toOutput(users[0]) };
  }

  @Get("/:userId")
  @ApiOperation({ summary: "Get a user" })
  async getUser(@Param("userId", ParseIntPipe) userId: number): Promise<GetManagedUserOutput> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return { status: SUCCESS_STATUS, data: this.toOutput(user) };
  }

  @Patch("/:userId")
  @ApiOperation({ summary: "Update a user" })
  async updateUser(
    @Param("userId", ParseIntPipe) userId: number,
    @Body() body: UpdateManagedUserInput
  ): Promise<GetManagedUserOutput> {
    // metadata is replaced as a whole, so a new value must keep the chatbot link
    if (body.metadata && !body.metadata.chatbotUserId) {
      throw new BadRequestException(CHATBOT_USER_ID_REQUIRED);
    }

    const user = await this.usersRepository.update(userId, body);

    return { status: SUCCESS_STATUS, data: this.toOutput(user) };
  }

  @Delete("/:userId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a user" })
  async deleteUser(@Param("userId", ParseIntPipe) userId: number): Promise<GetManagedUserOutput> {
    const user = await this.usersRepository.delete(userId);

    return { status: SUCCESS_STATUS, data: this.toOutput(user) };
  }

  private toOutput(user: User): ManagedUserOutput {
    return plainToInstance(ManagedUserOutput, user, { strategy: "excludeAll" });
  }
}
