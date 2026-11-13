import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity.js";

export enum AssetClass {
  EQUITY = "EQUITY",
  MUTUAL_FUND = "MUTUAL_FUND",
  ETF = "ETF",
  PPF_EPF = "PPF_EPF",
  GOLD = "GOLD",
}

@Entity({ name: "investment_holdings" })
@Index(["userId", "assetClass"])
export class InvestmentHolding {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ length: 120 })
  name: string; // e.g., "UTI Nifty 50 Index Fund"

  @Column({ type: "enum", enum: AssetClass, default: AssetClass.MUTUAL_FUND })
  assetClass: AssetClass;

  @Column({ length: 80, nullable: true })
  categoryTag: string; // e.g., "Nifty 50", "Midcap Focus"

  @Column({ length: 50, nullable: true })
  tickerSymbol: string; // e.g., "RELIANCE"

  @Column({ length: 20, nullable: true })
  isin: string; // Crucial for mapping Groww CSV imports reliably without name mismatches

  @Column({ type: "decimal", precision: 14, scale: 4, default: 0 })
  deliveryQuantity: number; // Free shares / unpledged units

  @Column({ type: "decimal", precision: 14, scale: 4, default: 0 })
  mtfQuantity: number; // Shares pledged as collateral for Groww Margin Trading

  @Column({ type: "decimal", precision: 14, scale: 2, default: 0 })
  averagePrice: number; // Weighted average cost basis per share

  @Column({ type: "decimal", precision: 14, scale: 2, default: 0 })
  investedAmount: number;

  @Column({ type: "decimal", precision: 14, scale: 2, default: 0 })
  currentValue: number;

  @Column({ default: true })
  isLiveSync: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
