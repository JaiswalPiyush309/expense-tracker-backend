import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import {
  ImportedTransactionStatus,
  TransactionDirection,
  TransactionSourceApp,
} from "../enums/transaction-sync.enum.js";

@Entity("imported_transactions")
@Index("UQ_IMPORTED_TRANSACTION_IDEMPOTENCY", ["userId", "idempotencyKey"], {
  unique: true,
})
@Index("IDX_IMPORTED_TRANSACTION_USER_DATE", ["userId", "transactionDate"])
@Index(
  "UQ_IMPORTED_TRANSACTION_REFERENCE",
  ["userId", "sourceApp", "providerReference"],
  {
    unique: true,
    where: '"providerReference" IS NOT NULL',
  },
)
export class ImportedTransaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "uuid" })
  sourceId: string;

  // Stable client-generated idempotency key
  @Column({ type: "varchar", length: 150 })
  idempotencyKey: string;

  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
  })
  providerReference: string | null;

  @Column({
    type: "varchar",
    length: 30,
  })
  sourceApp: TransactionSourceApp;

  @Column({
    type: "numeric",
    precision: 14,
    scale: 2,
  })
  amount: string;

  @Column({
    type: "varchar",
    length: 3,
    default: "INR",
  })
  currency: string;

  @Column({
    type: "varchar",
    length: 20,
  })
  direction: TransactionDirection;

  @Column({
    type: "varchar",
    length: 255,
    nullable: true,
  })
  merchantName: string | null;

  @Column({
    type: "varchar",
    length: 20,
    default: "UPI",
  })
  paymentMethod: string;

  @Column({ type: "timestamptz" })
  transactionDate: Date;

  @Column({
    type: "varchar",
    length: 30,
    default: ImportedTransactionStatus.PENDING,
  })
  processingStatus: ImportedTransactionStatus;

  @Column({ type: "uuid", nullable: true })
  accountId: string | null;

  @Column({ type: "uuid", nullable: true })
  categoryId: string | null;

  @Column({ type: "uuid", nullable: true })
  transactionId: string | null;

  // Store only sanitized metadata, never full notification contents
  @Column({
    type: "jsonb",
    nullable: true,
  })
  metadata: Record<string, unknown> | null;

  @Column({
    type: "text",
    nullable: true,
  })
  failureReason: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
