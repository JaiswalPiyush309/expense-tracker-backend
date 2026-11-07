import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { CategoryType } from "../entities/category.entity.js";

export class CreateCategoryDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsEnum(CategoryType)
  type: CategoryType; // EXPENSE | INCOME

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string; // e.g. "shopping-cart", "utensils", "briefcase"

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string; // e.g. "#10B981"
}
