import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class UpdatePreferencesDTO {
  @IsOptional()
  @IsIn(["INR", "USD", "EUR", "GBP", "AED", "SGD"])
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @IsOptional()
  @IsIn(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"])
  dateFormat?: string;

  @IsOptional()
  @IsIn(["en-IN", "en-US", "en-GB"])
  numberFormat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string; // IANA name, validated in the service

  @IsOptional()
  @IsIn(["en", "hi"])
  language?: string;
}
