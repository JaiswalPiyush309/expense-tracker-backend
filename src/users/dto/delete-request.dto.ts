import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class DeleteRequestDTO {
  @IsString()
  @IsNotEmpty()
  password: string; // re-authentication for a destructive action

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
