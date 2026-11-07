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
import { CategoriesService } from "./categories.service.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthUser } from "../auth/current-user.decorator.js";
import { CreateCategoryDTO } from "./dto/create-category.dto.js";
import { CategoryType } from "./entities/category.entity.js";
import { UpdateCategoryDTO } from "./constants/update-category.dto.js";

@Controller("categories")
@UseGuards(AuthGuard("jwt"))
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDTO) {
    return this.categoriesService.create(user.userId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query("type") type?: CategoryType,
  ) {
    return this.categoriesService.findAll(user.userId, type);
  }

  // Fast dropdown route for Add Expense / Add Income modal
  @Get("options")
  getDropdownOptions(
    @CurrentUser() user: AuthUser,
    @Query("type") type?: CategoryType,
  ) {
    return this.categoriesService.getDropdownOptions(user.userId, type);
  }

  @Get(":id")
  findOne(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.categoriesService.findOne(user.userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDTO,
  ) {
    return this.categoriesService.update(user.userId, id, dto);
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.categoriesService.remove(user.userId, id);
  }
}
