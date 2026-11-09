import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from "typeorm";
import type { ImportBatch } from "./import-batch.entity.js";
import { TransactionType } from "./transaction.entity.js";
import { Account } from "../../accounts/entities/account.entity.js";
import { Category } from "../../categories/entities/category.entity.js";

export enum StagedRowStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  EXCLUDED = "EXCLUDED", // Excluded from final sync
}

@Entity("staged_transactions")
@Index(["batchId", "status"])
@Index(["userId", "externalTransactionId"])
export class StagedTransaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  batchId: string;

  @ManyToOne("ImportBatch", (b: ImportBatch) => b.stagedTransactions, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "batchId" })
  batch: Relation<ImportBatch>;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "timestamp" })
  transactionDate: Date;

  @Column({ length: 255 })
  merchant: string;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  amount: number;

  @Column({ type: "enum", enum: TransactionType })
  type: TransactionType; // EXPENSE | INCOME | TRANSFER

  @Column({ type: "varchar", length: 100, nullable: true })
  externalTransactionId: string | null; // PhonePe Transaction ID or UTR

  @Column({ type: "varchar", length: 100, nullable: true })
  utr: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  rawInstrument: string | null; // e.g., "Credited to XXXXX9500004574"

  @Column({ type: "varchar", length: 4, nullable: true })
  accountNumberLast4: string | null;

  @Column({ type: "uuid", nullable: true })
  accountId: string | null; // Resolved Account or null if unresolved

  @ManyToOne(() => Account, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "accountId" })
  account: Account | null;

  @Column({ type: "uuid", nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "categoryId" })
  category: Category | null;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @Column({ default: false })
  isDuplicate: boolean; // Flagged true if already exists in transactions table

  @Column({
    type: "enum",
    enum: StagedRowStatus,
    default: StagedRowStatus.PENDING,
  })
  status: StagedRowStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
