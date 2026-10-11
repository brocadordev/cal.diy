import { SUCCESS_STATUS } from "@calcom/platform-constants";
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags as DocsTags } from "@nestjs/swagger";
import { API_VERSIONS_VALUES } from "@/lib/api-versions";
import { BulkRescheduleInput } from "@/modules/admin-bookings/inputs/bulk-reschedule.input";
import { AdminBookingsService } from "@/modules/admin-bookings/services/admin-bookings.service";
import { AdminApiKeyGuard } from "@/modules/auth/guards/admin-api-key/admin-api-key.guard";

@Controller({
  path: "/v2/bookings",
  version: API_VERSIONS_VALUES,
})
@UseGuards(AdminApiKeyGuard)
@DocsTags("Bookings")
export class AdminBookingsController {
  constructor(private readonly adminBookingsService: AdminBookingsService) {}

  @Post("/bulk-reschedule")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reschedule many bookings in one transaction" })
  async bulkReschedule(@Body() body: BulkRescheduleInput) {
    return { status: SUCCESS_STATUS, data: await this.adminBookingsService.bulkReschedule(body.items) };
  }
}
