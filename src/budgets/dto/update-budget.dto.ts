import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from "class-validator";
import { BudgetRuleCategory } from "../entities/budget.entity.js";

export class UpdateBudgetDTO {
  @IsNumber()
  @IsPositive()
  @IsOptional()
  amountLimit?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  alertThresholdPercent?: number;

  @IsEnum(BudgetRuleCategory)
  @IsOptional()
  ruleCategory?: BudgetRuleCategory;

  @IsString()
  @IsOptional()
  categoryTag?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
