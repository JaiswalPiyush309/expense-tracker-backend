import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { DataSource } from "typeorm";
import { StatementParserService } from "./statement-parser.service.js";
import { UploadStatementDTO } from "./dto/upload-statement.dto.js";
import {
  ImportBatch,
  ImportBatchStatus,
} from "./entities/import-batch.entity.js";
import { Account } from "../accounts/entities/account.entity.js";
import { Category } from "../categories/entities/category.entity.js";
import { Transaction, TransactionType } from "./entities/transaction.entity.js";
import {
  StagedRowStatus,
  StagedTransaction,
} from "./entities/staged-transaction.entity.js";
import { UpdateStagedTransactionDto } from "./dto/update-staged-transaction.dto.js";

@Injectable()
export class StatementImportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly statementParserService: StatementParserService,
  ) {}

  /**
   * STEP 1: Upload, Parse & Store in Staging Table
   */
  async uploadAndStage(
    userId: string,
    file: Express.Multer.File,
    dto: UploadStatementDTO,
  ): Promise<ImportBatch> {
    if (!userId) {
      throw new UnauthorizedException("Authenticated user id is missing.");
    }

    if (!file || !file.buffer) {
      throw new BadRequestException(
        "A valid statement file (CSV or XLSX) is required.",
      );
    }

    const parsedRows = this.statementParserService.parse(
      file.buffer,
      dto.upiApp,
      dto.bankCode,
    );

    if (!parsedRows.length) {
      throw new BadRequestException(
        "No valid transactions found in statement.",
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // 1. Fetch user accounts and categories to auto-resolve mappings
      const [accounts, categories] = await Promise.all([
        manager.find(Account, { where: { userId, isArchived: false } }),
        manager.find(Category, {
          where: [{ userId }, { isSystem: true }],
        }),
      ]);

      // 2. Fetch external IDs from transactions to detect duplicates
      const incomingTxIds = parsedRows
        .map((r) => r.externalTransactionId)
        .filter(Boolean) as string[];

      let existingExternalIds = new Set<string>();
      if (incomingTxIds.length > 0) {
        const existingRecords = await manager
          .createQueryBuilder(Transaction, "tx")
          .select("tx.note", "note")
          .where("tx.userId = :userId", { userId })
          .getRawMany();

        // Check if any incoming ID already appears in notes or references
        existingExternalIds = new Set(
          existingRecords
            .map((r) => r.note)
            .filter(Boolean)
            .flatMap((note: string) => note.match(/T\d{15,}/g) || []),
        );
      }

      // 3. Create the batch record
      const batch = manager.create(ImportBatch, {
        userId,
        fileName: file.originalname,
        sourceType: dto.sourceType,
        upiApp: dto.upiApp || null,
        bankCode: dto.bankCode || null,
        totalRows: parsedRows.length,
        status: ImportBatchStatus.STAGED,
      });
      await manager.save(ImportBatch, batch);

      // 4. Transform parsed rows into StagedTransaction records
      const stagedEntities = parsedRows.map((row) => {
        // Auto-match Account by last 4 digits
        const matchedAccount = row.accountNumberLast4
          ? accounts.find(
              (a) => a.accountNumberLast4 === row.accountNumberLast4,
            )
          : null;

        // Auto-suggest Category by keyword heuristics
        const matchedCategory = this.suggestCategory(
          row.merchant,
          row.type,
          categories,
        );

        const isDuplicate = row.externalTransactionId
          ? existingExternalIds.has(row.externalTransactionId)
          : false;

        return manager.create(StagedTransaction, {
          batchId: batch.id,
          userId,
          transactionDate: row.transactionDate,
          merchant: row.merchant,
          amount: row.amount,
          type: row.type,
          externalTransactionId: row.externalTransactionId,
          utr: row.utr,
          rawInstrument: row.rawInstrument,
          accountNumberLast4: row.accountNumberLast4,
          accountId: matchedAccount?.id || null,
          categoryId: matchedCategory?.id || null,
          note: row.externalTransactionId
            ? `Ref: ${row.externalTransactionId}`
            : null,
          isDuplicate,
          status: isDuplicate
            ? StagedRowStatus.EXCLUDED
            : StagedRowStatus.PENDING,
        });
      });

      await manager.save(StagedTransaction, stagedEntities);
      return batch;
    });
  }

  /**
   * STEP 2: Preview/Review all staged records for an active batch
   */
  async getStagedBatch(userId: string, batchId: string) {
    const batch = await this.dataSource.getRepository(ImportBatch).findOne({
      where: { id: batchId, userId },
      relations: [
        "stagedTransactions",
        "stagedTransactions.account",
        "stagedTransactions.category",
      ],
    });

    if (!batch) {
      throw new NotFoundException("Import batch not found");
    }

    return {
      batchId: batch.id,
      fileName: batch.fileName,
      status: batch.status,
      totalRows: batch.totalRows,
      unresolvedAccountsCount: batch.stagedTransactions.filter(
        (s) => !s.accountId,
      ).length,
      duplicatesCount: batch.stagedTransactions.filter((s) => s.isDuplicate)
        .length,
      records: batch.stagedTransactions,
    };
  }

  /**
   * STEP 3: Update a specific staged record during review (change category, account, or status)
   */
  async updateStagedRow(
    userId: string,
    stagedId: string,
    dto: UpdateStagedTransactionDto,
  ): Promise<StagedTransaction> {
    const repo = this.dataSource.getRepository(StagedTransaction);
    const staged = await repo.findOne({ where: { id: stagedId, userId } });

    if (!staged) {
      throw new NotFoundException("Staged transaction not found");
    }

    Object.assign(staged, dto);
    return repo.save(staged);
  }

  /**
   * STEP 4: Delete/Exclude an unwanted record
   */
  async deleteStagedRow(userId: string, stagedId: string): Promise<void> {
    const repo = this.dataSource.getRepository(StagedTransaction);
    const staged = await repo.findOne({ where: { id: stagedId, userId } });

    if (!staged) {
      throw new NotFoundException("Staged transaction not found");
    }

    await repo.remove(staged);
  }

  /**
   * STEP 5: Final Approval & Commit to Main Transactions Table
   */
  async commitBatch(userId: string, batchId: string) {
    return this.dataSource.transaction(async (manager) => {
      const batch = await manager.findOne(ImportBatch, {
        where: { id: batchId, userId },
        relations: ["stagedTransactions"],
      });

      if (!batch) {
        throw new NotFoundException("Import batch not found");
      }

      if (batch.status === ImportBatchStatus.COMMITTED) {
        throw new BadRequestException("This batch has already been committed.");
      }

      // Filter eligible transactions (exclude EXCLUDED status)
      const toCommit = batch.stagedTransactions.filter(
        (row) => row.status !== StagedRowStatus.EXCLUDED,
      );

      // Verify all records have an accountId
      const missingAccounts = toCommit.filter((r) => !r.accountId);
      if (missingAccounts.length > 0) {
        throw new BadRequestException(
          `${missingAccounts.length} transactions do not have a linked bank account. Please assign accounts before final submission.`,
        );
      }

      // 1. Group balance changes per account
      const accountDeltas = new Map<string, number>();
      for (const row of toCommit) {
        const delta =
          row.type === TransactionType.INCOME
            ? Number(row.amount)
            : -Number(row.amount);
        accountDeltas.set(
          row.accountId!,
          (accountDeltas.get(row.accountId!) || 0) + delta,
        );
      }

      // 2. Lock & update account balances
      for (const [accountId, balanceChange] of accountDeltas.entries()) {
        const account = await manager.findOne(Account, {
          where: { id: accountId, userId },
          lock: { mode: "pessimistic_write" },
        });

        if (account) {
          account.balance = Number(account.balance) + balanceChange;
          await manager.save(Account, account);
        }
      }

      // 3. Move records to the main Transaction table
      const mainTransactions = toCommit.map((row) =>
        manager.create(Transaction, {
          userId,
          accountId: row.accountId!,
          categoryId: row.categoryId,
          type: row.type,
          amount: row.amount,
          transactionDate: row.transactionDate,
          merchant: row.merchant,
          note: row.note || `Imported via ${batch.fileName}`,
        }),
      );

      await manager.save(Transaction, mainTransactions);

      // 4. Mark batch as committed
      batch.status = ImportBatchStatus.COMMITTED;
      await manager.save(ImportBatch, batch);

      return {
        success: true,
        committedCount: mainTransactions.length,
        message: `Successfully imported ${mainTransactions.length} transactions into your ledger.`,
      };
    });
  }

  /**
   * Helper: Keyword-based category suggestion
   */
  private suggestCategory(
    merchant: string,
    type: TransactionType,
    categories: Category[],
  ): Category | null {
    const text = merchant.toLowerCase();

    if (type === TransactionType.INCOME) {
      if (text.includes("salary") || text.includes("payroll")) {
        return (
          categories.find((c) => c.name.toLowerCase().includes("salary")) ||
          null
        );
      }
      return (
        categories.find((c) => c.name.toLowerCase().includes("other income")) ||
        null
      );
    }

    if (
      text.includes("swiggy") ||
      text.includes("zomato") ||
      text.includes("cafe")
    ) {
      return (
        categories.find((c) =>
          c.name.toLowerCase().includes("food delivery"),
        ) || null
      );
    }
    if (
      text.includes("blinkit") ||
      text.includes("zepto") ||
      text.includes("dmart")
    ) {
      return (
        categories.find((c) => c.name.toLowerCase().includes("groceries")) ||
        null
      );
    }
    if (
      text.includes("uber") ||
      text.includes("ola") ||
      text.includes("rapido")
    ) {
      return (
        categories.find((c) => c.name.toLowerCase().includes("commute")) || null
      );
    }
    if (
      text.includes("petrol") ||
      text.includes("fuel") ||
      text.includes("fastag")
    ) {
      return (
        categories.find((c) => c.name.toLowerCase().includes("fuel")) || null
      );
    }

    return null;
  }
}
