import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateIf,
} from "class-validator";
import { TransactionType } from "../entities/transaction.entity.js";

export class CreateTransactionDTO {
  @IsUUID()
  @IsNotEmpty()
  accountId: string;

  @ValidateIf((o) => o.type === TransactionType.TRANSFER)
  @IsUUID()
  @IsNotEmpty()
  toAccountId?: string;

  @ValidateIf((o) => o.type !== TransactionType.TRANSFER)
  @IsUUID()
  @IsNotEmpty()
  categoryId?: string;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsDateString()
  transactionDate: string;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
