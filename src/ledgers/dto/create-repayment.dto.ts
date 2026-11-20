import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from "class-validator";
import { RepaymentMode } from "../entities/ledger-repayment.entity.js";

export class CreateRepaymentDTO {
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsDateString()
  @IsNotEmpty()
  paymentDate: string;

  @IsEnum(RepaymentMode)
  paymentMode: RepaymentMode;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
