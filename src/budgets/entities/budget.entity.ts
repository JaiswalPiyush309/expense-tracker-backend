import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Unique,
  Index,
} from "typeorm";
import { User } from "../../users/entities/user.entity.js";
import { Category } from "../../categories/entities/category.entity.js";

export enum BudgetRuleCategory {
  NEEDS = "NEEDS",
  WANTS = "WANTS",
  SAVINGS = "SAVINGS",
}

@Entity("budgets")
@Unique(["userId", "categoryId", "month", "year"])
@Index(["userId", "year", "month"])
export class Budget {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "uuid", nullable: true })
  categoryId: string | null; // Null = Overall master monthly budget

  @ManyToOne(() => Category, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "categoryId" })
  category: Category;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  amountLimit: number;

  @Column({ type: "int" })
  month: number; // 1 - 12

  @Column({ type: "int" })
  year: number; // e.g. 2025, 2026

  @Column({ type: "int", default: 80 })
  alertThresholdPercent: number;

  @Column({
    type: "enum",
    enum: BudgetRuleCategory,
    default: BudgetRuleCategory.WANTS,
  })
  ruleCategory: BudgetRuleCategory;

  @Column({ length: 80, nullable: true })
  categoryTag: string | null; // e.g. "Primary Residence", "Daily Needs", "Discretionary"

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
