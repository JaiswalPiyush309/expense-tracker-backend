import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InvestmentHolding } from "./entities/investment-holding.entity.js";
import { InvestmentTransaction } from "./entities/investment-transaction.entity.js";
import { InvestmentsService } from "./investments.service.js";
import { InvestmentsController } from "./investments.controller.js";
import { GrowwImportService } from "./groww-import.service.js";
import { Account } from "../accounts/entities/account.entity.js";
import { Transaction } from "../transactions/entities/transaction.entity.js";

@Module({
  imports: [TypeOrmModule.forFeature([InvestmentHolding, InvestmentTransaction, Account, Transaction])],
  providers: [InvestmentsService, GrowwImportService],
  controllers: [InvestmentsController],
})
export class InvestmentsModule {}
