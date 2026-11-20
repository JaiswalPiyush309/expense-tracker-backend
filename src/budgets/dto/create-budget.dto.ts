import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { BudgetRuleCategory } from "../entities/budget.entity.js";

export class CreateBudgetDTO {
  @IsUUID()
  @IsOptional()
  categoryId?: string; // Optional: null/undefined for master budget cap

  @IsNumber()
  @IsPositive()
  amountLimit: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  alertThresholdPercent?: number = 80;

  @IsEnum(BudgetRuleCategory)
  @IsOptional()
  ruleCategory?: BudgetRuleCategory = BudgetRuleCategory.WANTS;

  @IsString()
  @IsOptional()
  categoryTag?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
