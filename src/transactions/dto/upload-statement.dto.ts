import { IsEnum, IsOptional, IsString } from "class-validator";
import { ImportSourceType, UpiApp } from "../entities/import-batch.entity.js";

export class UploadStatementDTO {
  @IsEnum(ImportSourceType)
  sourceType: ImportSourceType; // 'UPI' | 'BANK'

  @IsOptional()
  @IsEnum(UpiApp)
  upiApp?: UpiApp; // 'PHONEPE' | 'GPAY' | 'PAYTM'

  @IsOptional()
  @IsString()
  bankCode?: string; // 'HDFC', 'SBIN', etc.
}
