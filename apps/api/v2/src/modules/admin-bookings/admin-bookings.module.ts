import { Module } from "@nestjs/common";
import { AdminBookingsController } from "@/modules/admin-bookings/controllers/admin-bookings.controller";
import { AdminBookingsService } from "@/modules/admin-bookings/services/admin-bookings.service";
import { PrismaModule } from "@/modules/prisma/prisma.module";
import { BookingsRepository_2024_08_13 } from "@/platform/bookings/2024-08-13/repositories/bookings.repository";
import { EventTypesRepository_2024_06_14 } from "@/platform/event-types/event-types_2024_06_14/event-types.repository";
import { SchedulesRepository_2024_06_11 } from "@/platform/schedules/schedules_2024_06_11/schedules.repository";

@Module({
  imports: [PrismaModule],
  providers: [
    AdminBookingsService,
    BookingsRepository_2024_08_13,
    EventTypesRepository_2024_06_14,
    SchedulesRepository_2024_06_11,
  ],
  controllers: [AdminBookingsController],
})
export class AdminBookingsModule {}
