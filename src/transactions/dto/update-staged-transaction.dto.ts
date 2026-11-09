import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { TransactionType } from "../entities/transaction.entity.js";
import { StagedRowStatus } from "../entities/staged-transaction.entity.js";

export class UpdateStagedTransactionDto {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  amount?: number;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(StagedRowStatus)
  status?: StagedRowStatus;
}
