import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InvestmentHolding } from "./entities/investment-holding.entity.js";
import { InvestmentTransaction } from "./entities/investment-transaction.entity.js";
import { InvestmentsService } from "./investments.service.js";
import { InvestmentsController } from "./investments.controller.js";
import { GrowwImportService } from "./groww-import.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([InvestmentHolding, InvestmentTransaction])],
  providers: [InvestmentsService, GrowwImportService],
  controllers: [InvestmentsController],
})
export class InvestmentsModule {}
