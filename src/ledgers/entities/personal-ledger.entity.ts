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
import { LedgerRepayment } from "./ledger-repayment.entity.js";

export enum LedgerType {
  LENT = "LENT", // Receivable (Money Lent - creator is creditor)
  BORROWED = "BORROWED", // Liability (Money Borrowed - creator is debtor)
}

export enum LedgerStatus {
  PENDING = "PENDING",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  SETTLED = "SETTLED",
}

@Entity("personal_ledgers")
@Index(["userId", "type", "status"])
@Index(["counterpartyUserId"])
@Index(["counterpartyEmail"])
@Index(["counterpartyPhone"])
export class PersonalLedger {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /** The user who created/manages this entry */
  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /** If the counterparty is a registered member of the platform, this links to their user account */
  @Column({ type: "uuid", nullable: true })
  counterpartyUserId: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "counterpartyUserId" })
  counterpartyUser: User | null;

  /** Whether this is money lent (receivable) or borrowed (payable) from creator's perspective */
  @Column({ type: "enum", enum: LedgerType })
  type: LedgerType;

  /** Name of the contact / person */
  @Column({ length: 100 })
  counterpartyName: string;

  /** Optional email to link or notify member */
  @Column({ length: 150, nullable: true })
  counterpartyEmail: string | null;

  /** Optional phone to identify member */
  @Column({ length: 30, nullable: true })
  counterpartyPhone: string | null;

  /** Relationship category (e.g. "Friend", "Colleague", "Family", "Business", "Other") */
  @Column({ length: 50, nullable: true })
  relationship: string | null;

  /** Principal amount of loan */
  @Column({ type: "decimal", precision: 12, scale: 2 })
  principalAmount: number;

  /** Total amount repaid to date */
  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  settledAmount: number;

  /** Annual interest rate (e.g. 0 for friendly loans) */
  @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
  interestRate: number;

  /** Date when the loan occurred / was disbursed */
  @Column({ type: "date", default: () => "CURRENT_DATE" })
  lentDate: Date;

  /** Repayment due date */
  @Column({ type: "date", nullable: true })
  dueDate: Date | null;

  /** Disbursing/Receiving Bank Account ID from accounts table */
  @Column({ type: "uuid", nullable: true })
  sourceAccountId: string | null;

  /** Cached name of the bank/cash account (e.g. "HDFC Salary A/c", "Cash in Hand") */
  @Column({ length: 100, nullable: true })
  sourceAccountName: string | null;

  /** Short description / title */
  @Column({ length: 150, nullable: true })
  description: string | null;

  /** Extended notes or terms */
  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "enum", enum: LedgerStatus, default: LedgerStatus.PENDING })
  status: LedgerStatus;

  @OneToMany(() => LedgerRepayment, (repayment) => repayment.ledger, {
    cascade: true,
  })
  repayments: LedgerRepayment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
