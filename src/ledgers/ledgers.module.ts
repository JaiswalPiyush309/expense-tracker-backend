import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PersonalLedger } from "./entities/personal-ledger.entity.js";
import { LedgerRepayment } from "./entities/ledger-repayment.entity.js";
import { User } from "../users/entities/user.entity.js";
import { LedgersService } from "./ledgers.service.js";
import { LedgersController } from "./ledgers.controller.js";

@Module({
  imports: [TypeOrmModule.forFeature([PersonalLedger, LedgerRepayment, User])],
  controllers: [LedgersController],
  providers: [LedgersService],
  exports: [LedgersService],
})
export class LedgersModule {}
