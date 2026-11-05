import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Account, AccountType } from "./entities/account.entity.js";
import { Repository } from "typeorm";
import { DataSource } from "typeorm/browser";
import { CreateAccountDTO } from "./dto/create-account.dto.js";
import { UpdateAccountDto } from "./dto/update-account.dto.js";
import {
  INDIAN_BANKS_CATALOG,
  SupportedBank,
} from "./constants/indian-banks.constant.js";

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Returns all Indian banks & wallets for the "Add Bank Account" dropdown.
   * Supports optional ?search= query param.
   */
  getSupportedBanks(search?: string): {
    popular: SupportedBank[];
    all: SupportedBank[];
  } {
    let list = [...INDIAN_BANKS_CATALOG];

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.bankName.toLowerCase().includes(q) ||
          b.shortName.toLowerCase().includes(q) ||
          b.code.toLowerCase().includes(q),
      );
    }

    // Sort alphabetically by bankName
    const all = list.sort((a, b) => a.bankName.localeCompare(b.bankName));
    const popular = list.filter((b) => b.isPopular);

    return { popular, all };
  }

  async create(userId: string, dto: CreateAccountDTO): Promise<Account> {
    return this.dataSource.transaction(async (manager) => {
      // Look up bank metadata if user selected a bankCode from the dropdown
      const matchedBank = dto.bankCode
        ? INDIAN_BANKS_CATALOG.find(
            (b) => b.code.toUpperCase() === dto.bankCode!.toUpperCase(),
          )
        : undefined;

      const resolvedBankName =
        dto.bankName ?? matchedBank?.bankName ?? "Custom Account";
      const resolvedShortName =
        dto.name ?? matchedBank?.shortName ?? resolvedBankName;
      const resolvedType =
        dto.type ?? matchedBank?.defaultAccountType ?? AccountType.BANK;
      const resolvedColor = dto.color ?? matchedBank?.brandColor ?? "#3B82F6";

      const existingCount = await manager.count(Account, { where: { userId } });

      const shouldBeDefault = dto.isDefault || existingCount === 0;
      if (shouldBeDefault) {
        await manager.update(
          Account,
          { userId, isDefault: true },
          { isDefault: false },
        );
      }

      const account = manager.create(Account, {
        ...dto,
        userId,
        name: resolvedShortName,
        bankName: resolvedBankName,
        type: resolvedType,
        color: resolvedColor,
        openingBalance: dto.openingBalance,
        balance: dto.openingBalance,
        isDefault: shouldBeDefault,
      });

      return manager.save(Account, account);
    });
  }

  async findAll(userId: string, includeArchived = false): Promise<Account[]> {
    return this.accountRepository.find({
      where: includeArchived ? { userId } : { userId, isArchived: false },
      order: { isDefault: "DESC", balance: "DESC" },
    });
  }

  /**
   * Lightweight endpoint for the "Add Expense / Add Income" bank selector dropdown
   */
  async getDropdownOptions(userId: string) {
    const accounts = await this.accountRepository.find({
      where: { userId, isArchived: false },
      select: [
        "id",
        "name",
        "bankName",
        "accountNumberLast4",
        "type",
        "balance",
        "currency",
        "isDefault",
        "color",
        "icon",
      ],
      order: { isDefault: "DESC", name: "ASC" },
    });

    return accounts.map((acc) => ({
      id: acc.id,
      name: acc.name,
      bankName: acc.bankName,
      type: acc.type,
      accountNumberLast4: acc.accountNumberLast4,
      displayLabel: acc.accountNumberLast4
        ? `${acc.name} (••${acc.accountNumberLast4})`
        : acc.name,
      currentBalance: Number(acc.balance),
      currency: acc.currency,
      isDefault: acc.isDefault,
      color: acc.color,
      icon: acc.icon,
    }));
  }

  async findOne(userId: string, id: string): Promise<Account> {
    const account = await this.accountRepository.findOne({
      where: { id, userId },
    });
    if (!account) {
      throw new NotFoundException("Bank account not found");
    }
    return account;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAccountDto,
  ): Promise<Account> {
    return this.dataSource.transaction(async (manager) => {
      const account = await manager.findOne(Account, { where: { id, userId } });
      if (!account) {
        throw new NotFoundException("Bank account not found");
      }

      if (dto.isDefault) {
        await manager.update(
          Account,
          { userId, isDefault: true },
          { isDefault: false },
        );
      }

      Object.assign(account, dto);
      return manager.save(Account, account);
    });
  }

  async archiveOrRemove(
    userId: string,
    id: string,
  ): Promise<{ message: string }> {
    const account = await this.findOne(userId, id);

    // Check if transactions exist on this account
    const txCount = await this.dataSource
      .getRepository("transactions")
      .count({ where: { accountId: id, userId } });

    if (txCount > 0) {
      // Soft-archive so historical transactions don't lose their bank reference
      account.isArchived = true;
      account.isDefault = false;
      await this.accountRepository.save(account);
      return {
        message: "Account has linked transactions and was archived safely.",
      };
    }

    await this.accountRepository.remove(account);
    return { message: "Account deleted permanently." };
  }
}
