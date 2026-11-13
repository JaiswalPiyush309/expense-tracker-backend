import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";
import { TradeSegment, TransactionType } from "../enums/transaction.enum.js";

@Entity("trade_transactions")
export class TradeTransaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 50 })
  tradingSymbol: string;

  @Column({ type: "enum", enum: TransactionType })
  transactionType: TransactionType;

  @Column({ type: "enum", enum: TradeSegment })
  segment: TradeSegment;

  @Column({ type: "int" })
  quantity: number;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  price: number;

  @Column({ type: "date" })
  tradeDate: Date;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  realizedPnl: number; // Populated only on SELL transactions

  @Column({ type: "varchar", length: 100, default: "Groww" })
  broker: string;

  @CreateDateColumn()
  createdAt: Date;
}
