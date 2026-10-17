import { Module } from "@nestjs/common";
import { AdminUsersController } from "@/modules/admin-users/controllers/admin-users.controller";
import { AdminUsersService } from "@/modules/admin-users/services/admin-users.service";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { UsersModule } from "@/modules/users/users.module";
import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";
import { SchedulesModule_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/schedules.module";

@Module({
  imports: [PrismaModule, UsersModule, SchedulesModule_2024_06_11],
  providers: [AdminUsersService, BookingsRepository_2024_08_13],
  controllers: [AdminUsersController],
})
export class AdminUsersModule {}
