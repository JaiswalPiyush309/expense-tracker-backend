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
import { AccountsService } from "./accounts.service.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { CreateAccountDTO } from "./dto/create-account.dto.js";
import { UpdateAccountDto } from "./dto/update-account.dto.js";

@Controller("accounts")
@UseGuards(AuthGuard("jwt"))
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  // 1. Returns list of Indian Banks for "Add Bank Account" modal dropdown
  @Get("supported-banks")
  getSupportedBanks(@Query("search") search?: string) {
    return this.accountsService.getSupportedBanks(search);
  }

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body() createAccountDto: CreateAccountDTO,
  ) {
    return this.accountsService.create(user.id, createAccountDto);
  }

  @Get()
  findAll(
    @CurrentUser() user: { id: string },
    @Query("includeArchived") includeArchived?: string,
  ) {
    return this.accountsService.findAll(user.id, includeArchived === "true");
  }

  // Used by your "Add Expense" / "Add Income" modal dropdown
  @Get("options")
  getDropdownOptions(@CurrentUser() user: { id: string }) {
    return this.accountsService.getDropdownOptions(user.id);
  }

  @Get(":id")
  findOne(
    @CurrentUser() user: { id: string },
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.accountsService.findOne(user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: { id: string },
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateAccountDto: UpdateAccountDto,
  ) {
    return this.accountsService.update(user.id, id, updateAccountDto);
  }

  @Delete(":id")
  remove(
    @CurrentUser() user: { id: string },
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.accountsService.archiveOrRemove(user.id, id);
  }
}
