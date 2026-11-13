import {
  BadRequestException,
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
import {
  AccountHintsDTO,
  ImportTransactionDTO,
} from "./dto/import-transaction.dto.js";
import {
  ImportedTransactionStatus,
  TransactionDirection,
} from "./enums/transaction-sync.enum.js";
import { Account } from "../accounts/entities/account.entity.js";
import {
  Category,
  CategoryType,
} from "../categories/entities/category.entity.js";
import { TransactionSourceMapping } from "./entities/transaction-source-mapping.entity.js";
import { SaveSourceMappingDTO } from "./dto/save-source-mapping.dto.js";

@Injectable()
export class TransactionSyncService {
  constructor(
    @InjectRepository(TransactionSource)
    private readonly transactionSourceRepository: Repository<TransactionSource>,

    @InjectRepository(ImportedTransaction)
    private readonly importedTransactionRepository: Repository<ImportedTransaction>,

    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,

    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,

    @InjectRepository(TransactionSourceMapping)
    private readonly transactionSourceMappingRepository: Repository<TransactionSourceMapping>,
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

    let source = await this.transactionSourceRepository.findOne({
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
      source = this.transactionSourceRepository.create({
        userId,
        deviceId: dto.deviceId,
        platform: dto.platform,
        sourceType: dto.sourceType,
        deviceName: dto.deviceName ?? null,
        deviceTokenHash,
        isActive: true,
      });
    }

    const saved = await this.transactionSourceRepository.save(source);

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

    const source = await this.transactionSourceRepository
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
    // 1. Verify registered device and its authentication token.
    const source = await this.getVerifiedSource(
      userId,
      dto.deviceId,
      deviceToken,
    );

    // 2. Check duplicate using client-generated idempotency key.
    const existing = await this.importedTransactionRepository.findOne({
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

    // 3. Check duplicate using provider transaction reference.
    if (providerReference) {
      const duplicate = await this.importedTransactionRepository.findOne({
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

    // 4. Automatically identify the user's account.
    // Priority:
    // UPI ID -> Bank details -> Configured app default.
    const matchedAccount = await this.resolveAccount(
      userId,
      dto.sourceApp,
      dto.accountHints,
    );

    // 5. Identify the category based on transaction direction.
    const matchedCategory = await this.resolveCategory(
      userId,
      dto.sourceApp,
      dto.direction,
    );

    // 6. Determine whether the transaction needs manual review.
    const requiresReview = !matchedAccount || !matchedCategory;

    let failureReason: string | null = null;

    if (!matchedAccount && !matchedCategory) {
      failureReason =
        "No matching account or category found. Please configure account and category mappings.";
    } else if (!matchedAccount) {
      failureReason =
        "No matching account found. Please configure an account mapping.";
    } else if (!matchedCategory) {
      failureReason = "No category configured for this transaction direction.";
    }

    // 7. Prepare imported transaction.
    const transaction = this.importedTransactionRepository.create({
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

      // Save matched account and category.
      accountId: matchedAccount?.id ?? null,
      categoryId: matchedCategory?.id ?? null,

      // Require review if account or category is missing.
      processingStatus: requiresReview
        ? ImportedTransactionStatus.REVIEW_REQUIRED
        : ImportedTransactionStatus.PENDING,

      failureReason,
      metadata: dto.metadata ?? null,
    });

    try {
      // 8. Save imported transaction.
      const saved = await this.importedTransactionRepository.save(transaction);

      // 9. Update device's last sync timestamp.
      source.lastSyncAt = new Date();
      await this.transactionSourceRepository.save(source);

      return {
        success: true,
        duplicate: false,
        message: requiresReview
          ? "Transaction received and requires manual review"
          : "Transaction received successfully",
        data: saved,
      };
    } catch (error: any) {
      // 10. Handle PostgreSQL unique constraint violations.
      if (error?.code === "23505") {
        // Check idempotency key again in case of concurrent requests.
        const duplicate = await this.importedTransactionRepository.findOne({
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

        // Check provider reference again.
        if (providerReference) {
          const referenceDuplicate =
            await this.importedTransactionRepository.findOne({
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

  // Validate that an account belongs to this user and is active.
  private async validateAccount(
    userId: string,
    accountId?: string,
  ): Promise<Account | null> {
    if (!accountId) return null;

    const account = await this.accountRepository.findOne({
      where: {
        id: accountId,
        userId,
        isArchived: false,
      },
    });

    if (!account) {
      throw new BadRequestException(
        "Selected account does not exist or is archived",
      );
    }

    return account;
  }

  // Validate category ownership and category type.
  // System categories with userId = null are also allowed.
  private async validateCategory(
    userId: string,
    categoryId: string | undefined,
    expectedType: CategoryType,
  ): Promise<Category | null> {
    if (!categoryId) return null;

    const category = await this.categoryRepository
      .createQueryBuilder("category")
      .where("category.id = :categoryId", { categoryId })
      .andWhere("(category.userId = :userId OR category.userId IS NULL)", {
        userId,
      })
      .andWhere("category.type = :expectedType", { expectedType })
      .getOne();

    if (!category) {
      throw new BadRequestException(
        `Selected category is invalid. Expected category type: ${expectedType}`,
      );
    }

    return category;
  }

  // Save or update the account/category configuration for one UPI app.
  async saveSourceMapping(userId: string, dto: SaveSourceMappingDTO) {
    await this.validateAccount(userId, dto.defaultAccountId);

    await this.validateCategory(
      userId,
      dto.expenseCategoryId,
      CategoryType.EXPENSE,
    );

    await this.validateCategory(
      userId,
      dto.incomeCategoryId,
      CategoryType.INCOME,
    );

    let mapping = await this.transactionSourceMappingRepository.findOne({
      where: {
        userId,
        sourceApp: dto.sourceApp,
      },
    });

    if (!mapping) {
      mapping = this.transactionSourceMappingRepository.create({
        userId,
        sourceApp: dto.sourceApp,
      });
    }

    mapping.defaultAccountId = dto.defaultAccountId ?? null;
    mapping.expenseCategoryId = dto.expenseCategoryId ?? null;
    mapping.incomeCategoryId = dto.incomeCategoryId ?? null;

    const saved = await this.transactionSourceMappingRepository.save(mapping);

    return {
      success: true,
      message: "Source mapping saved successfully",
      data: saved,
    };
  }

  // Return all app mappings for the current user.
  async getSourceMappings(userId: string) {
    const mappings = await this.transactionSourceMappingRepository.find({
      where: { userId },
      order: { sourceApp: "ASC" },
    });

    return {
      success: true,
      data: mappings,
    };
  }

  // Match account automatically, then use the configured app default.
  private async resolveAccount(
    userId: string,
    sourceApp: string,
    hints?: AccountHintsDTO,
  ): Promise<Account | null> {
    // 1. Exact UPI ID match.
    if (hints?.upiId) {
      const upiId = hints.upiId.trim().toLowerCase();

      const account = await this.accountRepository
        .createQueryBuilder("account")
        .where("account.userId = :userId", { userId })
        .andWhere("account.isArchived = false")
        .andWhere("LOWER(TRIM(account.upiId)) = :upiId", { upiId })
        .getOne();

      if (account) return account;
    }

    // 2. Bank name + last four digits match.
    if (hints?.bankName && hints?.accountNumberLast4) {
      const bankName = hints.bankName.trim().toLowerCase();
      const last4 = hints.accountNumberLast4.trim();

      const account = await this.accountRepository
        .createQueryBuilder("account")
        .where("account.userId = :userId", { userId })
        .andWhere("account.isArchived = false")
        .andWhere("LOWER(TRIM(account.bankName)) = :bankName", {
          bankName,
        })
        .andWhere("account.accountNumberLast4 = :last4", { last4 })
        .getOne();

      if (account) return account;
    }

    // 3. Configured fallback account for this app.
    const mapping = await this.transactionSourceMappingRepository.findOne({
      where: {
        userId,
        sourceApp: sourceApp as any,
      },
    });

    if (!mapping?.defaultAccountId) return null;

    return this.validateAccount(userId, mapping.defaultAccountId);
  }

  // Resolve the default category for the direction.
  private async resolveCategory(
    userId: string,
    sourceApp: string,
    direction: TransactionDirection,
  ): Promise<Category | null> {
    const mapping = await this.transactionSourceMappingRepository.findOne({
      where: {
        userId,
        sourceApp: sourceApp as any,
      },
    });

    if (!mapping) return null;

    const categoryId =
      direction === TransactionDirection.DEBIT
        ? mapping.expenseCategoryId
        : mapping.incomeCategoryId;

    const expectedType =
      direction === TransactionDirection.DEBIT
        ? CategoryType.EXPENSE
        : CategoryType.INCOME;

    return this.validateCategory(userId, categoryId ?? undefined, expectedType);
  }
}
