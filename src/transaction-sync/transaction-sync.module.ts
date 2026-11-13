import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TransactionSource } from "./entities/transaction-source.entity.js";
import { ImportedTransaction } from "./entities/imported-transaction.entity.js";
import { TransactionSyncController } from "./transaction-sync.controller.js";
import { TransactionSyncService } from "./transaction-sync.service.js";
import { TransactionSourceMapping } from "./entities/transaction-source-mapping.entity.js";
import { Account } from "../accounts/entities/account.entity.js";
import { Category } from "../categories/entities/category.entity.js";
import { Transaction } from "typeorm";
import { TransactionsModule } from "../transactions/transactions.module.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionSource,
      ImportedTransaction,
      TransactionSourceMapping,
      Account,
      Category,
    ]),
    TransactionsModule,
  ],
  controllers: [TransactionSyncController],
  providers: [TransactionSyncService],
  exports: [TransactionSyncService],
})
export class TransactionSyncModule {}
