import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { CreateTransactionDTO } from "./dto/create-transaction.dto.js";
import { Account } from "../accounts/entities/account.entity.js";
import { Transaction, TransactionType } from "./entities/transaction.entity.js";
import { TransactionQueryDTO } from "./dto/transaction-query.dto.js";

@Injectable()
export class TransactionsService {
  constructor(
    private readonly dataSource: DataSource,
  ) {}

  async create(
    userId: string,
    dto: CreateTransactionDTO,
  ): Promise<Transaction> {
    return this.dataSource.transaction(async (manager) => {
      return this.createWithinTransaction(manager, userId, dto);
    });
  }

  /**
   * Creates a transaction using an existing EntityManager.
   * This allows transaction imports to reuse the same database transaction.
   */
  async createWithinTransaction(
    manager: EntityManager,
    userId: string,
    dto: CreateTransactionDTO,
  ): Promise<Transaction> {
    const amount = Number(dto.amount);
    const transactionDate = new Date(dto.transactionDate);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Amount must be greater than zero");
    }

    if (Number.isNaN(transactionDate.getTime())) {
      throw new BadRequestException("Invalid transaction date");
    }

    if (
      dto.type === TransactionType.TRANSFER &&
      (!dto.toAccountId || dto.toAccountId === dto.accountId)
    ) {
      throw new BadRequestException(
        "Valid destination account required for transfer",
      );
    }

    const account = await manager.findOne(Account, {
      where: { id: dto.accountId, userId },
      lock: { mode: "pessimistic_write" },
    });

    if (!account) {
      throw new NotFoundException("Source account not found");
    }

    if (dto.type === TransactionType.EXPENSE) {
      account.balance = Number(account.balance) - amount;
      await manager.save(Account, account);
    } else if (dto.type === TransactionType.INCOME) {
      account.balance = Number(account.balance) + amount;
      await manager.save(Account, account);
    } else if (dto.type === TransactionType.TRANSFER) {
      const toAccount = await manager.findOne(Account, {
        where: { id: dto.toAccountId, userId },
        lock: { mode: "pessimistic_write" },
      });

      if (!toAccount) {
        throw new NotFoundException("Destination account not found");
      }

      account.balance = Number(account.balance) - amount;
      toAccount.balance = Number(toAccount.balance) + amount;

      await manager.save(Account, [account, toAccount]);
    }

    const transaction = manager.create(Transaction, {
      ...dto,
      userId,
      toAccountId:
        dto.type === TransactionType.TRANSFER ? dto.toAccountId : undefined,
      transactionDate,
    });

    return manager.save(Transaction, transaction);
  }

  async findAll(userId: string, query: TransactionQueryDTO) {
    const {
      page = 1,
      limit = 20,
      type,
      accountId,
      categoryId,
      startDate,
      endDate,
      search,
    } = query;

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      throw new BadRequestException("startDate must be before endDate");
    }

    const qb = this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder("tx")
      .leftJoinAndSelect("tx.category", "category")
      .leftJoinAndSelect("tx.account", "account")
      .leftJoinAndSelect("tx.toAccount", "toAccount")
      .where("tx.userId = :userId", { userId });

    if (type) qb.andWhere("tx.type = :type", { type });
    if (accountId) qb.andWhere("tx.accountId = :accountId", { accountId });
    if (categoryId) qb.andWhere("tx.categoryId = :categoryId", { categoryId });
    if (startDate)
      qb.andWhere("tx.transactionDate >= :startDate", { startDate });
    if (endDate) {
      const endDateValue = new Date(endDate);
      // A date-only end date should include the entire day.
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        endDateValue.setUTCDate(endDateValue.getUTCDate() + 1);
      }
      qb.andWhere("tx.transactionDate < :endDate", {
        endDate: endDateValue,
      });
    }
    if (search) {
      qb.andWhere("(tx.merchant ILIKE :search OR tx.note ILIKE :search)", {
        search: `%${search}%`,
      });
    }

    qb.orderBy("tx.transactionDate", "DESC")
      .addOrderBy("tx.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const tx = await manager.findOne(Transaction, {
        where: { id, userId },
      });

      if (!tx) throw new NotFoundException("Transaction not found");

      const account = await manager.findOne(Account, {
        where: { id: tx.accountId, userId },
        lock: { mode: "pessimistic_write" },
      });

      const amount = Number(tx.amount);

      // Reverse the balance impact before deleting
      if (!account) {
        throw new NotFoundException("Source account not found");
      }

      if (tx.type === TransactionType.EXPENSE) {
        account.balance = Number(account.balance) + amount;
      } else if (tx.type === TransactionType.INCOME) {
        account.balance = Number(account.balance) - amount;
      } else if (tx.type === TransactionType.TRANSFER && tx.toAccountId) {
        const toAccount = await manager.findOne(Account, {
          where: { id: tx.toAccountId, userId },
          lock: { mode: "pessimistic_write" },
        });
        if (!toAccount) {
          throw new NotFoundException("Destination account not found");
        }
        account.balance = Number(account.balance) + amount;
        toAccount.balance = Number(toAccount.balance) - amount;
        await manager.save(Account, [account, toAccount]);
      } else {
        await manager.save(Account, account);
      }

      await manager.remove(Transaction, tx);
    });
  }
}
