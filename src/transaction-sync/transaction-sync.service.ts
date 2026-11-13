import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Repository } from "typeorm";

import { TransactionSource } from "./entities/transaction-source.entity.js";
import { ImportedTransaction } from "./entities/imported-transaction.entity.js";
import { RegisterDeviceDTO } from "./dto/register-device.dto.js";
import { ImportTransactionDTO } from "./dto/import-transaction.dto.js";
import { ImportedTransactionStatus } from "./enums/transaction-sync.enum.js";

@Injectable()
export class TransactionSyncService {
  constructor(
    @InjectRepository(TransactionSource)
    private readonly sourceRepository: Repository<TransactionSource>,

    @InjectRepository(ImportedTransaction)
    private readonly transactionRepository: Repository<ImportedTransaction>,
  ) {}

  private hashDeviceToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private verifyDeviceToken(token: string, storedHash: string): boolean {
    const suppliedHash = Buffer.from(this.hashDeviceToken(token), "hex");
    const expectedHash = Buffer.from(storedHash, "hex");

    return (
      suppliedHash.length === expectedHash.length &&
      timingSafeEqual(suppliedHash, expectedHash)
    );
  }

  // Register a device and issue a new device token.
  async registerDevice(userId: string, dto: RegisterDeviceDTO) {
    const deviceToken = randomBytes(32).toString("base64url");
    const deviceTokenHash = this.hashDeviceToken(deviceToken);

    let source = await this.sourceRepository.findOne({
      where: {
        userId,
        deviceId: dto.deviceId,
      },
    });

    if (source) {
      source.platform = dto.platform;
      source.sourceType = dto.sourceType;
      source.deviceName = dto.deviceName ?? null;
      source.deviceTokenHash = deviceTokenHash;
      source.isActive = true;
    } else {
      source = this.sourceRepository.create({
        userId,
        deviceId: dto.deviceId,
        platform: dto.platform,
        sourceType: dto.sourceType,
        deviceName: dto.deviceName ?? null,
        deviceTokenHash,
        isActive: true,
      });
    }

    const saved = await this.sourceRepository.save(source);

    // Return the raw token only once. Never return the stored hash.
    return {
      success: true,
      message: "Device registered successfully",
      data: {
        id: saved.id,
        deviceId: saved.deviceId,
        platform: saved.platform,
        sourceType: saved.sourceType,
        deviceName: saved.deviceName,
        isActive: saved.isActive,
      },
      deviceToken,
    };
  }

  // Verify that the request comes from a registered device.
  private async getVerifiedSource(
    userId: string,
    deviceId: string,
    deviceToken?: string,
  ): Promise<TransactionSource> {
    if (!deviceToken) {
      throw new UnauthorizedException("Device token is required");
    }

    const source = await this.sourceRepository
      .createQueryBuilder("source")
      .addSelect("source.deviceTokenHash")
      .where("source.userId = :userId", { userId })
      .andWhere("source.deviceId = :deviceId", { deviceId })
      .andWhere("source.isActive = :isActive", { isActive: true })
      .getOne();

    if (!source) {
      throw new NotFoundException("Active registered device not found");
    }

    if (
      !source.deviceTokenHash ||
      !this.verifyDeviceToken(deviceToken, source.deviceTokenHash)
    ) {
      throw new UnauthorizedException("Invalid device token");
    }

    return source;
  }

  // Import a detected UPI transaction.
  async importTransaction(
    userId: string,
    dto: ImportTransactionDTO,
    deviceToken?: string,
  ) {
    const source = await this.getVerifiedSource(
      userId,
      dto.deviceId,
      deviceToken,
    );

    const existing = await this.transactionRepository.findOne({
      where: {
        userId,
        idempotencyKey: dto.idempotencyKey,
      },
    });

    if (existing) {
      return {
        success: true,
        duplicate: true,
        message: "Transaction already received",
        data: existing,
      };
    }

    const providerReference = dto.providerReference?.trim() || null;

    if (providerReference) {
      const duplicate = await this.transactionRepository.findOne({
        where: {
          userId,
          sourceApp: dto.sourceApp,
          providerReference,
        },
      });

      if (duplicate) {
        return {
          success: true,
          duplicate: true,
          message: "Transaction already imported",
          data: duplicate,
        };
      }
    }

    const transaction = this.transactionRepository.create({
      userId,
      sourceId: source.id,
      idempotencyKey: dto.idempotencyKey,
      providerReference,
      sourceApp: dto.sourceApp,
      amount: dto.amount.toFixed(2),
      currency: dto.currency ?? "INR",
      direction: dto.direction,
      merchantName: dto.merchantName ?? null,
      paymentMethod: "UPI",
      transactionDate: new Date(dto.transactionDate),
      processingStatus: ImportedTransactionStatus.PENDING,
      metadata: dto.metadata ?? null,
    });

    try {
      const saved = await this.transactionRepository.save(transaction);

      source.lastSyncAt = new Date();
      await this.sourceRepository.save(source);

      return {
        success: true,
        duplicate: false,
        message: "Transaction received successfully",
        data: saved,
      };
    } catch (error: any) {
      if (error?.code === "23505") {
        const duplicate = await this.transactionRepository.findOne({
          where: {
            userId,
            idempotencyKey: dto.idempotencyKey,
          },
        });

        if (duplicate) {
          return {
            success: true,
            duplicate: true,
            message: "Transaction already received",
            data: duplicate,
          };
        }

        if (providerReference) {
          const referenceDuplicate = await this.transactionRepository.findOne({
            where: {
              userId,
              sourceApp: dto.sourceApp,
              providerReference,
            },
          });

          if (referenceDuplicate) {
            return {
              success: true,
              duplicate: true,
              message: "Transaction already imported",
              data: referenceDuplicate,
            };
          }
        }
      }

      throw error;
    }
  }
}
