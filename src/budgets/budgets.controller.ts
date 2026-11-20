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
import { BudgetsService } from "./budgets.service.js";
import { CreateBudgetDTO } from "./dto/create-budget.dto.js";
import { UpdateBudgetDTO } from "./dto/update-budget.dto.js";
import { ReallocateBudgetDTO } from "./dto/reallocate-budget.dto.js";
import { QueryBudgetDTO } from "./dto/query-budget.dto.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/current-user.decorator.js";

@Controller("budgets")
@UseGuards(AuthGuard("jwt"))
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get("summary")
  async getSummary(@CurrentUser() user: AuthUser) {
    return this.budgetsService.getSummary(user.userId);
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryBudgetDTO,
  ) {
    return this.budgetsService.findAll(user.userId, query);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateBudgetDTO,
  ) {
    return this.budgetsService.create(user.userId, dto);
  }

  @Post("reallocate")
  async reallocate(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReallocateBudgetDTO,
  ) {
    return this.budgetsService.reallocate(user.userId, dto);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetDTO,
  ) {
    return this.budgetsService.update(user.userId, id, dto);
  }

  @Delete(":id")
  async remove(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.budgetsService.remove(user.userId, id);
  }
}
