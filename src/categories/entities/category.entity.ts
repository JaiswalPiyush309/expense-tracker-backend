import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "../../users/entities/user.entity.js";

export enum CategoryType {
  INCOME = "INCOME",
  EXPENSE = "EXPENSE",
}

@Entity("categories")
@Index(["userId", "type"])
export class Category {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid", nullable: true })
  userId: string | null; // Null means global/system category

  @ManyToOne(() => User, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ length: 80 })
  name: string;

  @Column({ type: "enum", enum: CategoryType })
  type: CategoryType;

  @Column({ nullable: true, length: 50 })
  icon: string;

  @Column({ nullable: true, length: 20 })
  color: string;

  @Column({ default: false })
  isSystem: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
