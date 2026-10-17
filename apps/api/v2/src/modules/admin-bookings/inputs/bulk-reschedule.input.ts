import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class BulkRescheduleItem {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  uid!: string;

  @ApiProperty()
  @IsInt()
  eventTypeId!: number;

  @ApiProperty({ example: "2026-10-12T13:00:00Z" })
  @IsDateString()
  start!: string;

  @ApiPropertyOptional({ description: "Without it, the booking gets the length of the event type." })
  @IsOptional()
  @IsInt()
  @Min(1)
  lengthInMinutes?: number;
}

export class BulkRescheduleInput {
  @ApiProperty({ type: [BulkRescheduleItem] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BulkRescheduleItem)
  items!: BulkRescheduleItem[];
}
