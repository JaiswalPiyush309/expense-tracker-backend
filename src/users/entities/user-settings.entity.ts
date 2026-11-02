import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./user.entity.js";

export interface NotificationSettings {
  emailAlerts: boolean;
  pushAlerts: boolean;
  smsAlerts: boolean;
  budgetAlerts: boolean;
  billReminders: boolean;
  unusualActivity: boolean;
  weeklySummary: boolean;
  monthlyReport: boolean;
  productUpdates: boolean;
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  emailAlerts: true,
  pushAlerts: true,
  smsAlerts: false,
  budgetAlerts: true,
  billReminders: true,
  unusualActivity: true,
  weeklySummary: true,
  monthlyReport: true,
  productUpdates: false,
};

/** One row per user. Created lazily with India-friendly defaults. */
@Entity("user_settings")
export class UserSettings {
  @PrimaryColumn("uuid")
  userId: string;

  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  // financial & regional preferences
  @Column({ default: "INR" })
  currency: string;

  @Column({ type: "int", default: 4 })
  fiscalYearStartMonth: number; // 4 = April (Indian FY)

  @Column({ default: "DD/MM/YYYY" })
  dateFormat: string;

  @Column({ default: "en-IN" })
  numberFormat: string;

  @Column({ default: "Asia/Kolkata" })
  timezone: string;

  @Column({ default: "en" })
  language: string;

  // notification preferences
  @Column({ type: "jsonb" }) notifications: NotificationSettings;

  @UpdateDateColumn()
  updatedAt: Date;
}
