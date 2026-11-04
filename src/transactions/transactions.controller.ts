import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";

// Adjust import path if your JwtAuthGuard is inside src/auth/guards or global
import { AuthGuard } from "@nestjs/passport";
import { CreateTransactionDTO } from "./dto/create-transaction.dto.js";
import { TransactionsService } from "./transactions.service.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { TransactionQueryDTO } from "./dto/transaction-query.dto.js";
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

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: TransactionQueryDTO,
  ) {
    return this.transactionsService.findAll(user.userId, query);
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.remove(user.userId, id);
  }
}
