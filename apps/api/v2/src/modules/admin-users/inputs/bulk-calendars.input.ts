import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsDateString, IsInt, IsOptional } from "class-validator";

export class BulkCalendarsInput {
  @ApiProperty({ type: [Number], example: [19, 20] })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  userIds!: number[];

  @ApiProperty({ example: "2026-10-12T00:00:00Z" })
  @IsDateString()
  start!: string;

  @ApiPropertyOptional({ description: "Without it, the response has all the bookings from start on." })
  @IsOptional()
  @IsDateString()
  end?: string;
}
