import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity.js";
import { Transaction } from "../../transactions/entities/transaction.entity.js";

export enum AccountType {
  CASH = "CASH",
  BANK = "BANK",
  CREDIT_CARD = "CREDIT_CARD",
  WALLET = "WALLET",
  INVESTMENT = "INVESTMENT",
}

@Entity("accounts")
@Index(["userId", "isArchived"])
export class Account {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ length: 100 })
  name: string; // Display nickname, e.g., "HDFC Salary", "ICICI Savings", "Paytm"

  @Column({ type: "enum", enum: AccountType, default: AccountType.BANK })
  type: AccountType;

  @Column({ length: 100, nullable: true })
  bankName: string; // e.g., "HDFC Bank", "State Bank of India"

  @Column({ length: 4, nullable: true })
  accountNumberLast4: string; // e.g., "4582" (Safe to display in dropdown: "HDFC ••4582")

  @Column({ length: 100, nullable: true })
  upiId: string; // Optional, e.g., "piyush@okhdfcbank"

  @Column({ length: 3, default: "INR" }) // Or linked to UserSettings currency
  currency: string;

  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  openingBalance: number; // Initial balance when the user adds the account

  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  balance: number; // Current live balance (updated automatically on every transaction)

  @Column({ nullable: true, length: 50 })
  icon: string;

  @Column({ nullable: true, length: 20 })
  color: string;

  @Column({ default: false })
  isDefault: boolean; // Pre-selects this account in "Add Expense / Add Income" modal

  @Column({ default: false })
  isArchived: boolean;

  @OneToMany(() => Transaction, (transaction) => transaction.account)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
