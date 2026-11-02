import { IsBoolean, IsOptional } from "class-validator";

export class UpdateNotificationsDTO {
  @IsOptional()
  @IsBoolean()
  emailAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  pushAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  smsAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  budgetAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  billReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  unusualActivity?: boolean;

  @IsOptional()
  @IsBoolean()
  weeklySummary?: boolean;

  @IsOptional()
  @IsBoolean()
  monthlyReport?: boolean;

  @IsOptional()
  @IsBoolean()
  productUpdates?: boolean;
}
