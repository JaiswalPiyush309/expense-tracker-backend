import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Budget } from "./entities/budget.entity.js";
import { Category } from "../categories/entities/category.entity.js";
import { Transaction } from "../transactions/entities/transaction.entity.js";
import { User } from "../users/entities/user.entity.js";
import { BudgetsService } from "./budgets.service.js";
import { BudgetsController } from "./budgets.controller.js";

@Module({
  imports: [TypeOrmModule.forFeature([Budget, Category, Transaction, User])],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
