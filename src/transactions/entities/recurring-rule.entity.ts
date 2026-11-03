import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "../../users/entities/user.entity.js";

export enum RecurringKind {
  SIP = "SIP",
  AUTO_DEBIT = "AUTO_DEBIT",
}

@Entity("recurring_rules")
@Index(["userId", "isActive"])
export class RecurringRule {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ length: 100 })
  title: string; // e.g., "PPF", "UTI Index"

  @Column({ type: "enum", enum: RecurringKind, default: RecurringKind.SIP })
  kind: RecurringKind;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  monthlyAmount: number;

  @Column({ type: "int", default: 2 })
  dayOfMonth: number; // e.g., 2 -> "02 May 2025"

  @Column({ type: "date", nullable: true })
  lastExecutedAt: Date | null;

  @Column({ type: "date" })
  nextExecutionDate: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
