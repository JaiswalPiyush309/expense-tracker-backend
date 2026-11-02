import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum DataRequestType {
  EXPORT = "export",
  DELETE = "delete",
}

export enum DataRequestStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
  FAILED = "failed",
}

@Entity("data_requests")
@Index(["userId", "type", "status"])
export class DataRequest {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column("uuid")
  userId: string;

  @Column({ type: "enum", enum: DataRequestType })
  type: DataRequestType;

  @Column({
    type: "enum",
    enum: DataRequestStatus,
    default: DataRequestStatus.PENDING,
  })
  status: DataRequestStatus;

  @Column({ type: "text", nullable: true })
  reason?: string;

  @Column({ type: "timestamptz", nullable: true })
  scheduledFor?: Date; // deletion grace-period end

  @Column({ type: "timestamptz", nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
