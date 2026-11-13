import { IsEnum, IsOptional, IsUUID } from "class-validator";

import { TransactionSourceApp } from "../enums/transaction-sync.enum.js";

export class SaveSourceMappingDTO {
  @IsEnum(TransactionSourceApp)
  sourceApp: TransactionSourceApp;

  @IsOptional()
  @IsUUID()
  defaultAccountId?: string;

  @IsOptional()
  @IsUUID()
  expenseCategoryId?: string;

  @IsOptional()
  @IsUUID()
  incomeCategoryId?: string;
}
