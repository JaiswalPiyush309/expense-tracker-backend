import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from "typeorm";
import { PersonalLedger } from "./personal-ledger.entity.js";
import { User } from "../../users/entities/user.entity.js";

export enum RepaymentMode {
  UPI = "UPI",
  BANK_TRANSFER = "BANK_TRANSFER",
  CASH = "CASH",
  CHEQUE = "CHEQUE",
}

@Entity("personal_ledger_repayments")
@Index(["ledgerId", "paymentDate"])
export class LedgerRepayment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  ledgerId: string;

  @ManyToOne(() => PersonalLedger, (ledger) => ledger.repayments, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "ledgerId" })
  ledger: Relation<PersonalLedger>;

  /** The user who logged this repayment */
  @Column({ type: "uuid" })
  recordedByUserId: string;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "recordedByUserId" })
  recordedByUser: User | null;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  amount: number;

  @Column({ type: "date" })
  paymentDate: Date;

  @Column({
    type: "enum",
    enum: RepaymentMode,
    default: RepaymentMode.UPI,
  })
  paymentMode: RepaymentMode;

  @Column({ length: 100, nullable: true })
  referenceId: string | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
