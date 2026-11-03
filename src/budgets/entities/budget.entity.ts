import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Unique,
} from "typeorm";
import { User } from "../../users/entities/user.entity.js";
import { Category } from "../../categories/entities/category.entity.js";

@Entity("budgets")
@Unique(["userId", "categoryId", "month", "year"])
export class Budget {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "uuid", nullable: true })
  categoryId: string | null; // Null = Overall monthly budget

  @ManyToOne(() => Category, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "categoryId" })
  category: Category;

  @Column({ type: "decimal", precision: 12, scale: 2 })
  amountLimit: number;

  @Column({ type: "int" })
  month: number; // 1 - 12

  @Column({ type: "int" })
  year: number; // e.g., 2026

  @Column({ type: "int", default: 80 })
  alertThresholdPercent: number; // Trigger alert when 80% spent (ties into user-settings notifications!)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
