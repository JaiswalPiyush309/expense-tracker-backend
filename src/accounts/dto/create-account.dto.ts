import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
import { AccountType } from "../entities/account.entity.js";

export class CreateAccountDTO {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankCode?: string; // Selected from dropdown, e.g., "HDFC", "SBIN", "PYTM"

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string; // Optional custom nickname; defaults to catalog shortName (e.g., "HDFC")

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string; // Auto-filled from catalog if bankCode is provided

  @IsEnum(AccountType)
  type: AccountType;

  @IsOptional()
  @IsString()
  @Length(4, 4, {
    message: "Please provide only the last 4 digits of the account/card",
  })
  @Matches(/^\d{4}$/, { message: "Last 4 digits must be numeric" })
  accountNumberLast4?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  upiId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  openingBalance: number; // Sets both openingBalance and initial live balance

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string = "INR";

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
