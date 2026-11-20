import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";
import { LedgerStatus, LedgerType } from "../entities/personal-ledger.entity.js";

export class UpdateLedgerDTO {
  @IsOptional()
  @IsEnum(LedgerType)
  type?: LedgerType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  counterpartyName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  counterpartyEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  counterpartyPhone?: string;

  @IsOptional()
  @IsUUID()
  counterpartyUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  relationship?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  principalAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  interestRate?: number;

  @IsOptional()
  @IsDateString()
  lentDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  sourceAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(LedgerStatus)
  status?: LedgerStatus;
}
