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
import { Account } from "../../accounts/entities/account.entity.js";
import { Category } from "../../categories/entities/category.entity.js";

export enum TransactionType {
  INCOME = "INCOME",
  EXPENSE = "EXPENSE",
  TRANSFER = "TRANSFER",
  INVESTMENT = "INVESTMENT",
  BORROW = "BORROW",
  BORROW_REPAYMENT = "BORROW_REPAYMENT",
  LEND = "LEND",
  LEND_REPAYMENT = "LEND_REPAYMENT",
}

export enum SettlementStatus {
  OPEN = "OPEN",
  PARTIAL = "PARTIAL",
  SETTLED = "SETTLED",
}

export interface RepaymentAllocation {
  parentId: string;
  amount: number;
}

@Entity("transactions")
@Index(["userId", "transactionDate"])
@Index(["userId", "categoryId"])
@Index(["userId", "accountId"])
@Index(["userId", "type", "settlementStatus"])
@Index(["parentTransactionId"])
export class Transaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "uuid" })
  accountId: string;

  @ManyToOne(() => Account, (account) => account.transactions, {
    onDelete: "RESTRICT",
  })
  @JoinColumn({ name: "accountId" })
  account: Account;

  // Used only when type === TransactionType.TRANSFER
  @Column({ type: "uuid", nullable: true })
  toAccountId: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "toAccountId" })
  toAccount: Account;

  @Column({ type: "uuid", nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "categoryId" })
  category: Category;

  @Column({ type: "enum", enum: TransactionType })
  type: TransactionType;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  amount: number;

  @Column({ type: "timestamp" })
  transactionDate: Date;

  @Column({ type: "varchar", length: 255, nullable: true })
  merchant: string | null;

  @Column({ type: "varchar", length: 150, nullable: true })
  counterpartyName: string | null;

  @Column({ type: "uuid", nullable: true })
  parentTransactionId: string | null;

  @ManyToOne(() => Transaction, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "parentTransactionId" })
  parentTransaction: Transaction | null;

  @Column({ type: "enum", enum: SettlementStatus, nullable: true })
  settlementStatus: SettlementStatus | null;

  @Column({ type: "decimal", precision: 14, scale: 2, nullable: true })
  remainingAmount: number | null;

  @Column({ type: "jsonb", nullable: true })
  repaymentAllocations: RepaymentAllocation[] | null;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @Column({ type: "simple-array", nullable: true })
  tags: string[] | null;

  @Column({ type: "varchar", nullable: true })
  attachmentUrl: string | null; // Receipt image URL

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
