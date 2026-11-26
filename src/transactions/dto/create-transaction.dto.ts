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

const DEBT_TYPES = [
  TransactionType.BORROW,
  TransactionType.BORROW_REPAYMENT,
  TransactionType.LEND,
  TransactionType.LEND_REPAYMENT,
];

export class CreateTransactionDTO {
  @IsUUID()
  @IsNotEmpty()
  accountId: string;

  @ValidateIf((o) => o.type === TransactionType.TRANSFER)
  @IsUUID()
  @IsNotEmpty()
  toAccountId?: string;

  @ValidateIf(
    (o) =>
      o.type === TransactionType.INCOME || o.type === TransactionType.EXPENSE,
  )
  @IsUUID()
  @IsNotEmpty()
  categoryId?: string | null;

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

  @ValidateIf((o) => DEBT_TYPES.includes(o.type))
  @IsString()
  @IsNotEmpty({ message: "Counterparty / Party name is required for debt transactions" })
  counterpartyName?: string;

  @IsOptional()
  @IsUUID()
  parentTransactionId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
