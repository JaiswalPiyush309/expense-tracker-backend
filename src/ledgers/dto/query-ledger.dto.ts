import { IsEnum, IsOptional, IsString } from "class-validator";
import { LedgerStatus, LedgerType } from "../entities/personal-ledger.entity.js";

export class QueryLedgerDTO {
  @IsOptional()
  @IsEnum(LedgerType)
  type?: LedgerType;

  @IsOptional()
  @IsEnum(LedgerStatus)
  status?: LedgerStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  timeframe?: "ALL" | "DUE_THIS_WEEK" | "DUE_THIS_MONTH" | "OVERDUE" | "SETTLED";
}
