import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  TransactionPlatform,
  TransactionSourceType,
} from "../enums/transaction-sync.enum.js";

export class RegisterDeviceDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deviceId: string;

  @IsEnum(TransactionPlatform)
  platform: TransactionPlatform;

  @IsEnum(TransactionSourceType)
  sourceType: TransactionSourceType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;
}
