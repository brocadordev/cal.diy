import { ApiHideProperty, ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsArray,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  isEmail,
  Min,
  Validate,
} from "class-validator";

export const RESCHEDULED_BY_DOCS = `Email of the person who is rescheduling the booking - only needed when rescheduling a booking that requires a confirmation.
If event type owner email is provided then rescheduled booking will be automatically confirmed. If attendee email or no email is passed then the event type
owner will have to confirm the rescheduled booking.`;

export class RescheduleBookingInput_2024_08_13 {
  @IsDateString()
  @ApiProperty({
    description: "The start time of the booking in ISO 8601 format in UTC timezone.",
    example: "2024-08-13T09:00:00Z",
  })
  start!: string;

  @IsOptional()
  @ApiPropertyOptional({ description: RESCHEDULED_BY_DOCS })
  @Validate((value: string) => !value || isEmail(value), {
    message: "Invalid rescheduledBy email format",
  })
  rescheduledBy?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    example: "User requested reschedule",
    description: "Reason for rescheduling the booking",
  })
  reschedulingReason?: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    type: String,
    description: "Email verification code required when event type has email verification enabled.",
    example: "123456",
  })
  emailVerificationCode?: string;

  @IsOptional()
  @IsInt()
  @ApiPropertyOptional({
    example: 123,
    description:
      "Moves the booking to this event type. The owner of the event type becomes the host. If not provided, the booking keeps its event type.",
  })
  eventTypeId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    example: 45,
    description:
      "The length of the new booking. The event type does not need to list it. If not provided, the length of the event type is used.",
  })
  lengthInMinutes?: number;

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({
    type: Object,
    example: { customField: "customValue" },
    description:
      "Booking field responses to add to the booking. Use them to fill the required booking fields of the new event type when eventTypeId is provided. They do not change the existing responses.",
  })
  bookingFieldsResponses?: Record<string, unknown>;

  @ApiHideProperty()
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  rrHostSubsetIds?: number[];
}

export class RescheduleSeatedBookingInput_2024_08_13 {
  @IsDateString()
  @ApiProperty({
    description: "The start time of the booking in ISO 8601 format in UTC timezone.",
    example: "2024-08-13T09:00:00Z",
  })
  start!: string;

  @IsOptional()
  @ApiPropertyOptional({ description: RESCHEDULED_BY_DOCS })
  @Validate((value: string) => !value || isEmail(value), {
    message: "Invalid rescheduledBy email format",
  })
  rescheduledBy?: string;

  @ApiProperty({
    type: String,
    example: "3be561a9-31f1-4b8e-aefc-9d9a085f0dd1",
    description: "Uid of the specific seat within booking.",
  })
  @IsString()
  seatUid!: string;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional({
    type: String,
    description: "Email verification code required when event type has email verification enabled.",
    example: "123456",
  })
  emailVerificationCode?: string;
}
