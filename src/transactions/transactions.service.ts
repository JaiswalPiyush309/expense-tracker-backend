import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager, In } from "typeorm";
import { CreateTransactionDTO } from "./dto/create-transaction.dto.js";
import { UpdateTransactionDTO } from "./dto/update-transaction.dto.js";
import { Account } from "../accounts/entities/account.entity.js";
import {
  RepaymentAllocation,
  SettlementStatus,
  Transaction,
  TransactionType,
} from "./entities/transaction.entity.js";
import { TransactionQueryDTO } from "./dto/transaction-query.dto.js";

const DEBT_ORIGIN_TYPES = [TransactionType.BORROW, TransactionType.LEND];
const DEBT_REPAYMENT_TYPES = [
  TransactionType.BORROW_REPAYMENT,
  TransactionType.LEND_REPAYMENT,
];

@Injectable()
export class TransactionsService {
  constructor(private readonly dataSource: DataSource) {}

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

    const counterpartyName =
      dto.counterpartyName?.trim() || dto.merchant?.trim() || null;

    if (
      (DEBT_ORIGIN_TYPES.includes(dto.type) ||
        DEBT_REPAYMENT_TYPES.includes(dto.type)) &&
      !counterpartyName
    ) {
      throw new BadRequestException(
        "Counterparty / Party name is required for borrowing, lending, and repayments",
      );
    }

    const { settlementStatus, remainingAmount, repaymentAllocations } =
      await this.applyTransactionEffects(manager, userId, {
        accountId: dto.accountId,
        toAccountId: dto.toAccountId ?? null,
        type: dto.type,
        amount,
        counterpartyName,
        parentTransactionId: dto.parentTransactionId ?? null,
      });

    const isDebtOrTransfer =
      dto.type === TransactionType.TRANSFER ||
      dto.type === TransactionType.INVESTMENT ||
      DEBT_ORIGIN_TYPES.includes(dto.type) ||
      DEBT_REPAYMENT_TYPES.includes(dto.type);

    const transaction = manager.create(Transaction, {
      ...dto,
      userId,
      categoryId: isDebtOrTransfer ? (dto.categoryId ?? null) : dto.categoryId,
      toAccountId:
        dto.type === TransactionType.TRANSFER ? dto.toAccountId : null,
      counterpartyName,
      parentTransactionId: DEBT_REPAYMENT_TYPES.includes(dto.type)
        ? (dto.parentTransactionId ?? null)
        : null,
      settlementStatus,
      remainingAmount,
      repaymentAllocations,
      merchant: dto.merchant?.trim() || counterpartyName || null,
      transactionDate,
    });

    return manager.save(Transaction, transaction);
  }

  /**
   * Applies account balance updates and debt settlement (1-to-1 or FIFO) atomically.
   */
  private async applyTransactionEffects(
    manager: EntityManager,
    userId: string,
    params: {
      accountId: string;
      toAccountId: string | null;
      type: TransactionType;
      amount: number;
      counterpartyName: string | null;
      parentTransactionId: string | null;
    },
  ): Promise<{
    settlementStatus: SettlementStatus | null;
    remainingAmount: number | null;
    repaymentAllocations: RepaymentAllocation[] | null;
  }> {
    const {
      accountId,
      toAccountId,
      type,
      amount,
      counterpartyName,
      parentTransactionId,
    } = params;

    const account = await manager.findOne(Account, {
      where: { id: accountId, userId },
      lock: { mode: "pessimistic_write" },
    });

    if (!account) {
      throw new NotFoundException("Source account not found");
    }

    let settlementStatus: SettlementStatus | null = null;
    let remainingAmount: number | null = null;
    let repaymentAllocations: RepaymentAllocation[] | null = null;

    if (
      type === TransactionType.EXPENSE ||
      type === TransactionType.INVESTMENT
    ) {
      account.balance = Number((Number(account.balance) - amount).toFixed(2));
      await manager.save(Account, account);
    } else if (type === TransactionType.INCOME) {
      account.balance = Number((Number(account.balance) + amount).toFixed(2));
      await manager.save(Account, account);
    } else if (type === TransactionType.TRANSFER) {
      if (!toAccountId || toAccountId === accountId) {
        throw new BadRequestException(
          "Valid destination account required for transfer",
        );
      }
      const toAccount = await manager.findOne(Account, {
        where: { id: toAccountId, userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!toAccount) {
        throw new NotFoundException("Destination account not found");
      }
      account.balance = Number((Number(account.balance) - amount).toFixed(2));
      toAccount.balance = Number(
        (Number(toAccount.balance) + amount).toFixed(2),
      );
      await manager.save(Account, [account, toAccount]);
    } else if (type === TransactionType.BORROW) {
      // Cash inflow, increases liability
      account.balance = Number((Number(account.balance) + amount).toFixed(2));
      await manager.save(Account, account);
      settlementStatus = SettlementStatus.OPEN;
      remainingAmount = amount;
    } else if (type === TransactionType.LEND) {
      // Cash outflow, increases receivable
      account.balance = Number((Number(account.balance) - amount).toFixed(2));
      await manager.save(Account, account);
      settlementStatus = SettlementStatus.OPEN;
      remainingAmount = amount;
    } else if (type === TransactionType.BORROW_REPAYMENT) {
      // Cash outflow, decreases liability
      account.balance = Number((Number(account.balance) - amount).toFixed(2));
      await manager.save(Account, account);
      repaymentAllocations = await this.applyRepaymentSettlement(
        manager,
        userId,
        TransactionType.BORROW,
        amount,
        counterpartyName,
        parentTransactionId,
      );
    } else if (type === TransactionType.LEND_REPAYMENT) {
      // Cash inflow, decreases receivable
      account.balance = Number((Number(account.balance) + amount).toFixed(2));
      await manager.save(Account, account);
      repaymentAllocations = await this.applyRepaymentSettlement(
        manager,
        userId,
        TransactionType.LEND,
        amount,
        counterpartyName,
        parentTransactionId,
      );
    }

    return { settlementStatus, remainingAmount, repaymentAllocations };
  }

  /**
   * Settles a repayment against either a specific parentTransactionId (1-to-1)
   * or across all open/partial records for the counterparty in FIFO order.
   */
  private async applyRepaymentSettlement(
    manager: EntityManager,
    userId: string,
    targetParentType: TransactionType.BORROW | TransactionType.LEND,
    repaymentAmount: number,
    counterpartyName: string | null,
    parentTransactionId: string | null,
  ): Promise<RepaymentAllocation[]> {
    const allocations: RepaymentAllocation[] = [];

    if (parentTransactionId) {
      const parent = await manager.findOne(Transaction, {
        where: { id: parentTransactionId, userId, type: targetParentType },
        lock: { mode: "pessimistic_write" },
      });

      if (!parent) {
        throw new NotFoundException(
          `Target ${targetParentType.toLowerCase()} record not found`,
        );
      }

      const currentRemaining = Number(
        parent.remainingAmount ?? parent.amount ?? 0,
      );
      if (currentRemaining <= 0) {
        throw new BadRequestException(
          "Selected record is already fully settled",
        );
      }

      const applied = Number(
        Math.min(currentRemaining, repaymentAmount).toFixed(2),
      );
      const nextRemaining = Number(
        Math.max(0, currentRemaining - applied).toFixed(2),
      );

      parent.remainingAmount = nextRemaining;
      parent.settlementStatus =
        nextRemaining <= 0 ? SettlementStatus.SETTLED : SettlementStatus.PARTIAL;

      await manager.save(Transaction, parent);
      allocations.push({ parentId: parent.id, amount: applied });
      return allocations;
    }

    // FIFO settlement by counterpartyName
    if (!counterpartyName) {
      return allocations;
    }

    const openParents = await manager
      .createQueryBuilder(Transaction, "tx")
      .setLock("pessimistic_write")
      .where("tx.userId = :userId", { userId })
      .andWhere("tx.type = :type", { type: targetParentType })
      .andWhere("tx.settlementStatus IN (:...statuses)", {
        statuses: [SettlementStatus.OPEN, SettlementStatus.PARTIAL],
      })
      .andWhere("LOWER(TRIM(tx.counterpartyName)) = LOWER(TRIM(:party))", {
        party: counterpartyName,
      })
      .orderBy("tx.transactionDate", "ASC")
      .addOrderBy("tx.createdAt", "ASC")
      .getMany();

    let remainingToApply = repaymentAmount;

    for (const parent of openParents) {
      if (remainingToApply <= 0.0001) break;

      const currentRemaining = Number(
        parent.remainingAmount ?? parent.amount ?? 0,
      );
      if (currentRemaining <= 0) continue;

      const applied = Number(
        Math.min(currentRemaining, remainingToApply).toFixed(2),
      );
      const nextRemaining = Number(
        Math.max(0, currentRemaining - applied).toFixed(2),
      );

      parent.remainingAmount = nextRemaining;
      parent.settlementStatus =
        nextRemaining <= 0 ? SettlementStatus.SETTLED : SettlementStatus.PARTIAL;

      await manager.save(Transaction, parent);
      allocations.push({ parentId: parent.id, amount: applied });
      remainingToApply = Number((remainingToApply - applied).toFixed(2));
    }

    return allocations;
  }

  /**
   * Reverses account balance changes and parent debt settlements for delete/edit rollback.
   */
  private async reverseTransactionEffects(
    manager: EntityManager,
    userId: string,
    tx: Transaction,
  ): Promise<void> {
    const account = await manager.findOne(Account, {
      where: { id: tx.accountId, userId },
      lock: { mode: "pessimistic_write" },
    });

    if (!account) {
      throw new NotFoundException("Source account not found");
    }

    const amount = Number(tx.amount);

    if (
      tx.type === TransactionType.EXPENSE ||
      tx.type === TransactionType.INVESTMENT ||
      tx.type === TransactionType.LEND ||
      tx.type === TransactionType.BORROW_REPAYMENT
    ) {
      account.balance = Number((Number(account.balance) + amount).toFixed(2));
      await manager.save(Account, account);
    } else if (
      tx.type === TransactionType.INCOME ||
      tx.type === TransactionType.BORROW ||
      tx.type === TransactionType.LEND_REPAYMENT
    ) {
      account.balance = Number((Number(account.balance) - amount).toFixed(2));
      await manager.save(Account, account);
    } else if (tx.type === TransactionType.TRANSFER && tx.toAccountId) {
      const toAccount = await manager.findOne(Account, {
        where: { id: tx.toAccountId, userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!toAccount) {
        throw new NotFoundException("Destination account not found");
      }
      account.balance = Number((Number(account.balance) + amount).toFixed(2));
      toAccount.balance = Number(
        (Number(toAccount.balance) - amount).toFixed(2),
      );
      await manager.save(Account, [account, toAccount]);
    }

    // Reverse parent settlement allocations if this was a repayment
    if (DEBT_REPAYMENT_TYPES.includes(tx.type)) {
      const allocations: RepaymentAllocation[] =
        tx.repaymentAllocations && tx.repaymentAllocations.length > 0
          ? tx.repaymentAllocations
          : tx.parentTransactionId
            ? [{ parentId: tx.parentTransactionId, amount }]
            : [];

      for (const alloc of allocations) {
        const parent = await manager.findOne(Transaction, {
          where: { id: alloc.parentId, userId },
          lock: { mode: "pessimistic_write" },
        });
        if (!parent) continue;

        const principal = Number(parent.amount);
        const restored = Number(
          Math.min(
            principal,
            Number(parent.remainingAmount ?? 0) + Number(alloc.amount),
          ).toFixed(2),
        );

        parent.remainingAmount = restored;
        if (restored >= principal - 0.001) {
          parent.settlementStatus = SettlementStatus.OPEN;
        } else if (restored <= 0.001) {
          parent.settlementStatus = SettlementStatus.SETTLED;
        } else {
          parent.settlementStatus = SettlementStatus.PARTIAL;
        }

        await manager.save(Transaction, parent);
      }
    }
  }

  async findAll(userId: string, query: TransactionQueryDTO) {
    const {
      page = 1,
      limit = 20,
      type,
      accountId,
      relatedAccountId,
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
    if (relatedAccountId) {
      qb.andWhere(
        "(tx.accountId = :relatedAccountId OR tx.toAccountId = :relatedAccountId)",
        { relatedAccountId },
      );
    }
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
      qb.andWhere(
        "(tx.merchant ILIKE :search OR tx.note ILIKE :search OR tx.counterpartyName ILIKE :search)",
        { search: `%${search}%` },
      );
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

  /**
   * Return open / partially settled BORROW or LEND records and a summary grouped by counterpartyName.
   */
  async getOpenDebts(userId: string, type?: TransactionType) {
    const targetTypes =
      type && DEBT_ORIGIN_TYPES.includes(type) ? [type] : DEBT_ORIGIN_TYPES;

    const records = await this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder("tx")
      .leftJoinAndSelect("tx.account", "account")
      .where("tx.userId = :userId", { userId })
      .andWhere("tx.type IN (:...types)", { types: targetTypes })
      .andWhere("tx.settlementStatus IN (:...statuses)", {
        statuses: [SettlementStatus.OPEN, SettlementStatus.PARTIAL],
      })
      .andWhere("tx.remainingAmount > 0")
      .orderBy("tx.transactionDate", "ASC")
      .addOrderBy("tx.createdAt", "ASC")
      .getMany();

    const counterpartyMap = new Map<
      string,
      {
        counterpartyName: string;
        type: TransactionType;
        totalOutstanding: number;
        openCount: number;
      }
    >();

    const formattedRecords = records.map((r) => {
      const party = (r.counterpartyName || r.merchant || "Unknown").trim();
      const remaining = Number(r.remainingAmount ?? r.amount);
      const key = `${r.type}:${party.toLowerCase()}`;

      const existing = counterpartyMap.get(key) ?? {
        counterpartyName: party,
        type: r.type,
        totalOutstanding: 0,
        openCount: 0,
      };
      existing.totalOutstanding = Number(
        (existing.totalOutstanding + remaining).toFixed(2),
      );
      existing.openCount += 1;
      counterpartyMap.set(key, existing);

      return {
        id: r.id,
        type: r.type,
        counterpartyName: party,
        amount: Number(r.amount),
        remainingAmount: remaining,
        settlementStatus: r.settlementStatus,
        transactionDate: r.transactionDate,
        accountId: r.accountId,
        accountName: r.account?.name ?? null,
        note: r.note,
      };
    });

    return {
      records: formattedRecords,
      byCounterparty: Array.from(counterpartyMap.values()),
    };
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDTO,
  ): Promise<Transaction> {
    return this.dataSource.transaction(async (manager) => {
      const tx = await manager.findOne(Transaction, {
        where: { id, userId },
        lock: { mode: "pessimistic_write" },
      });

      if (!tx) throw new NotFoundException("Transaction not found");

      // 1. Reverse old balance & settlement effects
      await this.reverseTransactionEffects(manager, userId, tx);

      // 2. Compute updated values
      const nextType = dto.type ?? tx.type;
      const nextAmount =
        dto.amount !== undefined ? Number(dto.amount) : Number(tx.amount);
      if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
        throw new BadRequestException("Amount must be greater than zero");
      }

      const nextDate = dto.transactionDate
        ? new Date(dto.transactionDate)
        : tx.transactionDate;
      if (Number.isNaN(nextDate.getTime())) {
        throw new BadRequestException("Invalid transaction date");
      }

      const nextAccountId = dto.accountId ?? tx.accountId;
      const nextToAccountId =
        nextType === TransactionType.TRANSFER
          ? (dto.toAccountId !== undefined ? dto.toAccountId : tx.toAccountId)
          : null;
      const nextCounterparty =
        dto.counterpartyName !== undefined
          ? dto.counterpartyName.trim() || null
          : tx.counterpartyName;
      const nextParentId = DEBT_REPAYMENT_TYPES.includes(nextType)
        ? (dto.parentTransactionId !== undefined
            ? dto.parentTransactionId
            : tx.parentTransactionId)
        : null;

      // 3. Re-apply balance & settlement effects
      const { settlementStatus, remainingAmount, repaymentAllocations } =
        await this.applyTransactionEffects(manager, userId, {
          accountId: nextAccountId,
          toAccountId: nextToAccountId,
          type: nextType,
          amount: nextAmount,
          counterpartyName: nextCounterparty,
          parentTransactionId: nextParentId,
        });

      tx.accountId = nextAccountId;
      tx.toAccountId = nextToAccountId;
      tx.type = nextType;
      tx.amount = nextAmount;
      tx.transactionDate = nextDate;
      tx.categoryId =
        dto.categoryId !== undefined ? dto.categoryId : tx.categoryId;
      tx.merchant =
        dto.merchant !== undefined
          ? dto.merchant
          : (nextCounterparty ?? tx.merchant);
      tx.counterpartyName = nextCounterparty;
      tx.parentTransactionId = nextParentId;
      tx.settlementStatus = settlementStatus;
      tx.remainingAmount = remainingAmount;
      tx.repaymentAllocations = repaymentAllocations;
      if (dto.note !== undefined) tx.note = dto.note;
      if (dto.tags !== undefined) tx.tags = dto.tags;

      return manager.save(Transaction, tx);
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const tx = await manager.findOne(Transaction, {
        where: { id, userId },
        lock: { mode: "pessimistic_write" },
      });

      if (!tx) throw new NotFoundException("Transaction not found");

      await this.reverseTransactionEffects(manager, userId, tx);
      await manager.remove(Transaction, tx);
    });
  }
}
