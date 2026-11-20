import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";
import { LedgerType } from "../entities/personal-ledger.entity.js";

export class CreateLedgerDTO {
  @IsEnum(LedgerType)
  @IsNotEmpty()
  type: LedgerType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  counterpartyName: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  counterpartyEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  counterpartyPhone?: string;

  /** If selecting an existing member from the platform */
  @IsOptional()
  @IsUUID()
  counterpartyUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  relationship?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  principalAmount: number;

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
}
