import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Account } from "../accounts/entities/account.entity.js";
import { Transaction } from "./entities/transaction.entity.js";
import { TransactionsController } from "./transactions.controller.js";
import { TransactionsService } from "./transactions.service.js";
import { RecurringRule } from "./entities/recurring-rule.entity.js";
import { ImportBatch } from "./entities/import-batch.entity.js";
import { StagedTransaction } from "./entities/staged-transaction.entity.js";
import { Category } from "../categories/entities/category.entity.js";
import { StatementImportController } from "./statement-import.controller.js";
import { StatementImportService } from "./statement-import.service.js";
import { StatementParserService } from "./statement-parser.service.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      Transaction,
      RecurringRule,
      ImportBatch,
      StagedTransaction,
      Category,
    ]),
  ],
  controllers: [TransactionsController, StatementImportController],
  providers: [
    TransactionsService,
    StatementImportService,
    StatementParserService,
  ],
  exports: [TransactionsService, StatementImportService],
})
export class TransactionsModule {}
