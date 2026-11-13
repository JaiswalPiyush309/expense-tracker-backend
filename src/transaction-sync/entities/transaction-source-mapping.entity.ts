import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { TransactionSourceApp } from "../enums/transaction-sync.enum.js";

@Entity("transaction_source_mappings")
@Index("UQ_TRANSACTION_SOURCE_MAPPING_USER_APP", ["userId", "sourceApp"], {
  unique: true,
})
export class TransactionSourceMapping {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "varchar", length: 30 })
  sourceApp: TransactionSourceApp;

  // Fallback account if automatic matching cannot identify one.
  @Column({ type: "uuid", nullable: true })
  defaultAccountId: string | null;

  // Category to use for UPI debits.
  @Column({ type: "uuid", nullable: true })
  expenseCategoryId: string | null;

  // Category to use for UPI credits.
  @Column({ type: "uuid", nullable: true })
  incomeCategoryId: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
