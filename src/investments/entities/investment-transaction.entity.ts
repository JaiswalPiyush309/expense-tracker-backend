import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity.js";
import { InvestmentHolding } from "./investment-holding.entity.js";
import { TradeSegment } from "../enums/transaction.enum.js";

export enum TradeType {
  BUY = "BUY",
  SELL = "SELL",
  DIVIDEND = "DIVIDEND",
  MTF_INTEREST = "MTF_INTEREST", // Logs daily margin deductions from Groww
}

@Entity({ name: "investment_transactions" })
@Index(["userId", "tradeDate"])
export class InvestmentTransaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "uuid", nullable: true })
  holdingId: string;

  @ManyToOne(() => InvestmentHolding, { onDelete: "SET NULL" })
  @JoinColumn({ name: "holdingId" })
  holding: InvestmentHolding;

  @Column({ type: "enum", enum: TradeType })
  tradeType: TradeType;

  @Column({ type: "enum", enum: TradeSegment, nullable: true })
  segment: TradeSegment;

  @Column({ type: "decimal", precision: 14, scale: 4, nullable: true })
  quantity: number;

  @Column({ type: "decimal", precision: 14, scale: 2, nullable: true })
  executionPrice: number;

  @Column({ type: "decimal", precision: 14, scale: 2, default: 0 })
  chargesAndTaxes: number; // STT, Brokerage, GST mapped from Groww reports

  @Column({ type: "decimal", precision: 14, scale: 2, nullable: true })
  realizedPnl: number; // Populated only for SELL transactions

  @Column({ type: "date" })
  tradeDate: Date;

  @Column({ length: 100, default: "Groww" })
  broker: string;

  @CreateDateColumn()
  createdAt: Date;
}
