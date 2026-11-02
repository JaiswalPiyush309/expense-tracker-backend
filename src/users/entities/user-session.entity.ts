import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "./user.entity.js";

@Entity("user_sessions")
@Index(["userId", "revokedAt"])
export class UserSession {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ type: "varchar", nullable: true })
  ipAddress?: string;

  @Column({ type: "varchar", length: 512, nullable: true })
  userAgent?: string;

  @Column({ type: "varchar", nullable: true })
  device?: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "timestamptz" })
  lastActiveAt: Date;

  @Column({ type: "timestamptz" })
  expiresAt: Date;

  @Column({ type: "timestamptz", nullable: true })
  revokedAt: Date | null;
}
