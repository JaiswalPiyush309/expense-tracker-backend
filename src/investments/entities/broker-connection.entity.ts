import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("broker_connections")
@Index(["userId", "brokerName"], { unique: true })
export class BrokerConnection {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ length: 50, default: "UPSTOX" })
  brokerName: string;

  @Column({ type: "text" }) // Text type allows for long JWT/OAuth tokens
  accessToken: string;

  @Column({ type: "timestamp" })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
