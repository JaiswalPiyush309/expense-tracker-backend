import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from "typeorm";

@Entity("portfolio_holdings")
export class PortfolioHolding {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 50, unique: true })
  tradingSymbol: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  isin: string;

  @Column({ type: "int", default: 0 })
  deliveryQuantity: number; // Free shares

  @Column({ type: "int", default: 0 })
  mtfQuantity: number; // Pledged as collateral

  @Column({ type: "decimal", precision: 12, scale: 2 })
  averagePrice: number; // Weighted average cost basis

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  currentLtp: number; // Last Traded Price (updated via cron/live feed)

  @UpdateDateColumn()
  updatedAt: Date;
}
