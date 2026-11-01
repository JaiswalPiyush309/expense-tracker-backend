import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export enum Gender {
  MALE = "male",
  FEMALE = "female",
  OTHER = "other",
  PREFER_NOT_TO_SAY = "prefer_not_to_say",
}

export enum KycStatus {
  PENDING = "pending",
  VERIFIED = "verified",
  REJECTED = "rejected",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  name: string;

  // ---- profile columns (all nullable, so existing rows keep working) ----
  @Column({ type: "varchar", nullable: true })
  firstName?: string;

  @Column({ type: "varchar", nullable: true })
  lastName?: string;

  @Column({ type: "varchar", nullable: true })
  displayName?: string;

  @Column({ type: "varchar", nullable: true, unique: true })
  phone?: string;

  @Column({ default: false })
  phoneVerified: boolean;

  @Column({ type: "date", nullable: true })
  dateOfBirth?: string; // 'YYYY-MM-DD'

  @Column({ type: "enum", enum: Gender, nullable: true })
  gender?: Gender;

  @Column({ type: "varchar", length: 2, nullable: true })
  country?: string; // ISO 3166-1 alpha-2

  @Column({ type: "varchar", nullable: true })
  state?: string;

  @Column({ type: "varchar", nullable: true })
  city?: string;

  @Column({ type: "varchar", nullable: true })
  postalCode?: string;

  @Column({ type: "text", nullable: true })
  bio?: string;

  @Column({ type: "varchar", nullable: true })
  designation?: string;

  @Column({ type: "varchar", nullable: true })
  industry?: string;

  @Column({ type: "varchar", nullable: true })
  avatarFile?: string; // stored file name, not a URL

  // ---- read-only here: set by your billing / KYC flows ----
  @Column({ default: "FREE" })
  plan: string;

  @Column({ type: "enum", enum: KycStatus, default: KycStatus.PENDING })
  kycStatus: KycStatus;

  @Column({ type: "varchar", nullable: true })
  panMasked?: string; // e.g. ABCPS****K (never store the raw PAN here)

  @Column({ type: "varchar", nullable: true })
  aadhaarMasked?: string; // e.g. •••• •••• 9104

  @Column({ default: false })
  twoFactorEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
