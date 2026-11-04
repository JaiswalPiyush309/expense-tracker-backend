import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Account } from "../accounts/entities/account.entity.js";
import { Transaction } from "./entities/transaction.entity.js";
import { TransactionsController } from "./transactions.controller.js";
import { TransactionsService } from "./transactions.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([Account, Transaction])],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
