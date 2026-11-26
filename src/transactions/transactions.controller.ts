import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CreateTransactionDTO } from "./dto/create-transaction.dto.js";
import { UpdateTransactionDTO } from "./dto/update-transaction.dto.js";
import { TransactionsService } from "./transactions.service.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { TransactionQueryDTO } from "./dto/transaction-query.dto.js";
import { TransactionType } from "./entities/transaction.entity.js";
import type { AuthUser } from "../auth/current-user.decorator.js";

@Controller("transactions")
@UseGuards(AuthGuard("jwt"))
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() createTransactionDto: CreateTransactionDTO,
  ) {
    return this.transactionsService.create(user.userId, createTransactionDto);
  }

  @Get("debts/open")
  getOpenDebts(
    @CurrentUser() user: AuthUser,
    @Query("type") type?: TransactionType,
  ) {
    return this.transactionsService.getOpenDebts(user.userId, type);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: TransactionQueryDTO,
  ) {
    return this.transactionsService.findAll(user.userId, query);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateTransactionDto: UpdateTransactionDTO,
  ) {
    return this.transactionsService.update(
      user.userId,
      id,
      updateTransactionDto,
    );
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.remove(user.userId, id);
  }
}
