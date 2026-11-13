import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TradeTransaction } from "./entities/trade-transaction.entity.js";
import { PortfolioHolding } from "./entities/portfolio-holding.entity.js";
import { InvestmentsService } from "./investments.service.js";
import { InvestmentsController } from "./investments.controller.js";

@Module({
  imports: [TypeOrmModule.forFeature([TradeTransaction, PortfolioHolding])],
  providers: [InvestmentsService],
  controllers: [InvestmentsController],
})
export class InvestmentsModule {}
