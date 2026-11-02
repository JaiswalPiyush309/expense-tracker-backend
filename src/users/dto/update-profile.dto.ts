import {
  IsEnum,
  IsISO31661Alpha2,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { Gender } from "../entities/user.entity.js";

export class UpdateProfileDTO {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string; // international format, e.g. +918821936780

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "dateOfBirth must be in YYYY-MM-DD format",
  })
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsISO31661Alpha2()
  country?: string; // e.g. "IN"

  @IsOptional()
  @IsString()
  @MaxLength(80)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/, {
    message: "Invalid postal code",
  })
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  designation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;
}
