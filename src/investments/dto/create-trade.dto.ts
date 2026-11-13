import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { TradeType } from "../entities/investment-transaction.entity.js";
import { TradeSegment } from "../enums/transaction.enum.js";

export class CreateTradeDTO {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  tickerSymbol: string;

  @IsEnum(TradeType)
  @IsNotEmpty()
  tradeType: TradeType;

  @IsEnum(TradeSegment)
  @IsOptional()
  segment?: TradeSegment;

  @IsNumber()
  @IsOptional()
  quantity?: number;

  @IsNumber()
  @IsOptional()
  executionPrice?: number;

  @IsNumber()
  @IsOptional()
  chargesAndTaxes?: number;

  @IsString()
  @IsNotEmpty()
  tradeDate: string; // ISO Date string
}
