import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt ignores anything beyond 72 bytes
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      "newPassword must contain an uppercase letter, a lowercase letter and a number",
  })
  newPassword: string;
}
