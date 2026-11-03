import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity.js";

export enum LedgerType {
  LENT = "LENT", // Receivable (Money Lent)
  BORROWED = "BORROWED", // Liability (Money Borrowed)
}

export enum LedgerStatus {
  PENDING = "PENDING",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  SETTLED = "SETTLED",
}

@Entity("personal_ledgers")
@Index(["userId", "type", "status"])
export class PersonalLedger {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "enum", enum: LedgerType })
  type: LedgerType;

  @Column({ length: 100 })
  counterpartyName: string; // e.g., "Rahul", "Amit S."

  @Column({ type: "decimal", precision: 12, scale: 2 })
  principalAmount: number;

  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  settledAmount: number; // Remaining = principalAmount - settledAmount

  @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
  interestRate: number; // e.g., 0 for "0% Interest Friendly Loan"

  @Column({ type: "date", nullable: true })
  dueDate: Date | null;

  @Column({ length: 150, nullable: true })
  description: string; // e.g., "0% Interest Friendly Loan"

  @Column({ type: "enum", enum: LedgerStatus, default: LedgerStatus.PENDING })
  status: LedgerStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
