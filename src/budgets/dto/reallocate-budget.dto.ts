import { IsNumber, IsPositive, IsUUID } from "class-validator";

export class ReallocateBudgetDTO {
  @IsUUID()
  fromBudgetId: string;

  @IsUUID()
  toBudgetId: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}
