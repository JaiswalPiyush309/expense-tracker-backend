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
import type { StagedTransaction } from "./staged-transaction.entity.js";

export enum ImportSourceType {
  UPI = "UPI",
  BANK = "BANK",
}

export enum UpiApp {
  PHONEPE = "PHONEPE",
  GPAY = "GPAY",
  PAYTM = "PAYTM",
  BHIM = "BHIM",
  CRED = "CRED",
}

export enum ImportBatchStatus {
  STAGED = "STAGED", // Ready for review
  COMMITTED = "COMMITTED", // Moved to main transactions
  DISCARDED = "DISCARDED", // Canceled by user
}

@Entity("import_batches")
@Index(["userId", "status"])
export class ImportBatch {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ length: 255 })
  fileName: string;

  @Column({ type: "enum", enum: ImportSourceType })
  sourceType: ImportSourceType; // UPI | BANK

  @Column({ type: "enum", enum: UpiApp, nullable: true })
  upiApp: UpiApp | null; // PHONEPE | GPAY | PAYTM

  @Column({ length: 100, nullable: true })
  bankCode: string | null; // e.g. "HDFC", "SBIN"

  @Column({
    type: "enum",
    enum: ImportBatchStatus,
    default: ImportBatchStatus.STAGED,
  })
  status: ImportBatchStatus;

  @Column({ type: "int", default: 0 })
  totalRows: number;

  @OneToMany("StagedTransaction", (staged: StagedTransaction) => staged.batch, {
    cascade: true,
  })
  stagedTransactions: StagedTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
