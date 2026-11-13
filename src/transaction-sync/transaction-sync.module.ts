import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TransactionSource } from "./entities/transaction-source.entity.js";
import { ImportedTransaction } from "./entities/imported-transaction.entity.js";
import { TransactionSyncController } from "./transaction-sync.controller.js";
import { TransactionSyncService } from "./transaction-sync.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([TransactionSource, ImportedTransaction])],
  controllers: [TransactionSyncController],
  providers: [TransactionSyncService],
  exports: [TransactionSyncService],
})
export class TransactionSyncModule {}
