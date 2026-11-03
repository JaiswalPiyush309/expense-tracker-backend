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
  name: string;

  @Column({ type: "enum", enum: AccountType, default: AccountType.BANK })
  type: AccountType;

  @Column({ length: 3, default: "INR" }) // Or linked to UserSettings currency
  currency: string;

  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  balance: number;

  @Column({ nullable: true, length: 50 })
  icon: string;

  @Column({ nullable: true, length: 20 })
  color: string;

  @Column({ default: false })
  isArchived: boolean;

  @OneToMany(() => Transaction, (transaction) => transaction.account)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
