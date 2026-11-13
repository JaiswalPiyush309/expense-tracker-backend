import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsPositive,
  Length,
  MaxLength,
  IsObject,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  TransactionDirection,
  TransactionSourceApp,
} from "../enums/transaction-sync.enum.js";

export class AccountHintsDTO {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  upiId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  accountNumberLast4?: string;
}
export class ImportTransactionDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  idempotencyKey: string;

  @IsEnum(TransactionSourceApp)
  sourceApp: TransactionSourceApp;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsEnum(TransactionDirection)
  direction: TransactionDirection;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AccountHintsDTO)
  accountHints?: AccountHintsDTO;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  merchantName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  providerReference?: string;

  @IsISO8601()
  transactionDate: string;

  // Only allow sanitized, non-sensitive metadata
  @IsOptional()
  metadata?: Record<string, unknown>;
}
