import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RecurringRule } from "../transactions/entities/recurring-rule.entity.js";
import { PersonalLedger } from "../ledgers/entities/personal-ledger.entity.js";
import { InvestmentHolding } from "../investments/entities/investment-holding.entity.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";
import { Account } from "../accounts/entities/account.entity.js";
import { Transaction } from "typeorm";
import { Budget } from "../budgets/entities/budget.entity.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      Transaction,
      Budget,
      InvestmentHolding,
      PersonalLedger,
      RecurringRule,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
