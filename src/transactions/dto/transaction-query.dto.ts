import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsString,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { TransactionType } from "../entities/transaction.entity.js";

export class TransactionQueryDTO {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType; // EXPENSE | INCOME | TRANSFER

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string; // e.g., "2025-04-01"

  @IsOptional()
  @IsDateString()
  endDate?: string; // e.g., "2025-04-30"

  @IsOptional()
  @IsString()
  search?: string; // Searches merchant name or transaction note
}
