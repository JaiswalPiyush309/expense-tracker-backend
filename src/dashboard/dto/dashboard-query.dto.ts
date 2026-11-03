import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class DashboardQueryDTO {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number; // Defaults to current month if omitted

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;
}
