import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { LedgersService } from "./ledgers.service.js";
import { CreateLedgerDTO } from "./dto/create-ledger.dto.js";
import { UpdateLedgerDTO } from "./dto/update-ledger.dto.js";
import { CreateRepaymentDTO } from "./dto/create-repayment.dto.js";
import { QueryLedgerDTO } from "./dto/query-ledger.dto.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/current-user.decorator.js";

@Controller("ledgers")
@UseGuards(AuthGuard("jwt"))
export class LedgersController {
  constructor(private readonly ledgersService: LedgersService) {}

  @Get("summary")
  async getSummaryMetrics(@CurrentUser() user: AuthUser) {
    return this.ledgersService.getSummaryMetrics(user.userId);
  }

  @Get("members")
  async searchMembers(
    @CurrentUser() user: AuthUser,
    @Query("query") query?: string,
  ) {
    return this.ledgersService.searchMembers(user.userId, query);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLedgerDTO,
  ) {
    return this.ledgersService.create(user.userId, dto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryLedgerDTO,
  ) {
    return this.ledgersService.findAll(user.userId, query);
  }

  @Get(":id")
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.ledgersService.findOne(user.userId, id);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateLedgerDTO,
  ) {
    return this.ledgersService.update(user.userId, id, dto);
  }

  @Delete(":id")
  async remove(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.ledgersService.remove(user.userId, id);
  }

  @Post(":id/repayments")
  async recordRepayment(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateRepaymentDTO,
  ) {
    return this.ledgersService.recordRepayment(user.userId, id, dto);
  }

  @Delete(":id/repayments/:repaymentId")
  async deleteRepayment(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("repaymentId", ParseUUIDPipe) repaymentId: string,
  ) {
    return this.ledgersService.deleteRepayment(user.userId, id, repaymentId);
  }
}
