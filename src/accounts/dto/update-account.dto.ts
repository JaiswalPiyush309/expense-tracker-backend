import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsNumber, IsOptional } from "class-validator";
import { CreateAccountDTO } from "./create-account.dto.js";

export class UpdateAccountDto extends PartialType(CreateAccountDTO) {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  balance?: number; // Allows manual reconciliation/adjustment if needed

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
