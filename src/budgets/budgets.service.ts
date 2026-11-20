import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, DataSource, Repository } from "typeorm";
import { Budget, BudgetRuleCategory } from "./entities/budget.entity.js";
import { Category, CategoryType } from "../categories/entities/category.entity.js";
import {
  Transaction,
  TransactionType,
} from "../transactions/entities/transaction.entity.js";
import { CreateBudgetDTO } from "./dto/create-budget.dto.js";
import { UpdateBudgetDTO } from "./dto/update-budget.dto.js";
import { ReallocateBudgetDTO } from "./dto/reallocate-budget.dto.js";
import { QueryBudgetDTO } from "./dto/query-budget.dto.js";

export interface TransformedEnvelope {
  id: string;
  name: string;
  sublabel: string;
  categoryTag: string;
  iconName: string;
  transactionCount: number;
  allocatedAmount: number;
  actualSpent: number;
  remainingBalance: number;
  utilizationPercent: number;
  status: "HEALTHY" | "ON_TRACK" | "NEAR_LIMIT" | "OVER_BUDGET";
  ruleCategory: BudgetRuleCategory;
  footnoteLeft: string;
  footnoteRight: string;
  recentActivity: string;
  period: string;
}

@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Fetch all category envelope budgets along with real-time spending calculations
   */
  async findAll(userId: string, query: QueryBudgetDTO) {
    const today = new Date();
    const month = query.month ?? today.getMonth() + 1;
    const year = query.year ?? today.getFullYear();

    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const currentDay =
      month === today.getMonth() + 1 && year === today.getFullYear()
        ? Math.min(today.getDate(), totalDaysInMonth)
        : new Date(year, month - 1, 1) < new Date(today.getFullYear(), today.getMonth(), 1)
          ? totalDaysInMonth
          : 0;
    const remainingDays = Math.max(0, totalDaysInMonth - currentDay);
    const spendingThrough = currentDay === totalDaysInMonth
      ? endOfMonth
      : currentDay === 0
        ? new Date(startOfMonth.getTime() - 1)
        : new Date(year, month - 1, currentDay, 23, 59, 59, 999);

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const monthLabel = monthNames[month - 1];
    const periodString = `01 ${monthLabel} – ${totalDaysInMonth} ${monthLabel} ${year}`;

    // 1. Fetch user's registered budgets for this cycle
    const allBudgets = await this.budgetRepository.find({
      where: { userId, month, year },
      relations: ["category"],
      order: { amountLimit: "DESC" },
    });
    const master = allBudgets.find((budget) => budget.categoryId === null) ?? null;
    const budgets = allBudgets.filter((budget) => budget.categoryId !== null);

    // 2. Fetch all real expense transactions in this month range
    const transactions = await this.transactionRepository.find({
      where: {
        userId,
        type: TransactionType.EXPENSE,
        transactionDate: Between(startOfMonth, spendingThrough),
      },
      order: { transactionDate: "DESC" },
    });

    // Aggregate spending by categoryId
    const spentByCategory = new Map<string, { total: number; count: number; recent: string }>();
    let overallOutflow = 0;

    for (const txn of transactions) {
      const amount = Number(txn.amount);
      overallOutflow += amount;

      if (txn.categoryId) {
        const existing = spentByCategory.get(txn.categoryId) || {
          total: 0,
          count: 0,
          recent: "",
        };
        existing.total += amount;
        existing.count += 1;
        if (!existing.recent) {
          existing.recent = txn.merchant || txn.note || "Expense recorded";
        }
        spentByCategory.set(txn.categoryId, existing);
      }
    }

    // 3. Transform budgets into Envelope items
    const categoryBudgetTotal = budgets.reduce(
      (total, budget) => total + Number(budget.amountLimit),
      0,
    );
    const totalMasterBudget = master
      ? Number(master.amountLimit)
      : categoryBudgetTotal;
    let overBudgetCount = 0;
    let largestOverBudgetName = "";
    let largestOverBudgetAmount = 0;
    let needsSpent = 0;
    let wantsSpent = 0;

    const envelopes: TransformedEnvelope[] = budgets.map((b) => {
      const catId = b.categoryId || "";
      const spentInfo = spentByCategory.get(catId) || {
        total: 0,
        count: 0,
        recent: "No transactions yet",
      };

      const allocatedAmount = Number(b.amountLimit);
      const actualSpent = spentInfo.total;
      const remainingBalance = allocatedAmount - actualSpent;
      const utilizationPercent =
        allocatedAmount > 0
          ? Number(((actualSpent / allocatedAmount) * 100).toFixed(1))
          : 0;

      let status: "HEALTHY" | "ON_TRACK" | "NEAR_LIMIT" | "OVER_BUDGET";
      if (actualSpent > allocatedAmount) {
        status = "OVER_BUDGET";
        overBudgetCount++;
        const over = actualSpent - allocatedAmount;
        if (over > largestOverBudgetAmount) {
          largestOverBudgetAmount = over;
          largestOverBudgetName = b.category?.name || "Envelope";
        }
      } else if (utilizationPercent >= 80) {
        status = "NEAR_LIMIT";
      } else if (utilizationPercent >= 60) {
        status = "ON_TRACK";
      } else {
        status = "HEALTHY";
      }

      if (b.ruleCategory === BudgetRuleCategory.NEEDS) {
        needsSpent += actualSpent;
      } else if (b.ruleCategory === BudgetRuleCategory.WANTS) {
        wantsSpent += actualSpent;
      }

      const footnoteLeft =
        remainingBalance >= 0
          ? `Remaining: ₹${remainingBalance.toLocaleString("en-IN")}`
          : `Overrun: -₹${Math.abs(remainingBalance).toLocaleString("en-IN")}`;

      const footnoteRight =
        remainingBalance <= 0
          ? "0 days allowance"
          : remainingDays > 0
            ? `₹${Math.round(remainingBalance / remainingDays)} / day safe`
            : "Cycle ended";

      return {
        id: b.id,
        name: b.category?.name || "Master Budget",
        sublabel: b.categoryTag || b.category?.name || "General",
        categoryTag: b.categoryTag || "Envelope",
        iconName: b.category?.icon || "ShoppingCart",
        transactionCount: spentInfo.count,
        allocatedAmount,
        actualSpent,
        remainingBalance,
        utilizationPercent,
        status,
        ruleCategory: b.ruleCategory,
        footnoteLeft,
        footnoteRight,
        recentActivity: spentInfo.recent,
        period: periodString,
      };
    });

    const safeSurplus = Math.max(0, totalMasterBudget - overallOutflow);
    const outflowPercent =
      totalMasterBudget > 0
        ? Number(((overallOutflow / totalMasterBudget) * 100).toFixed(1))
        : 0;

    const pacingTargetPercent = Number(
      ((currentDay / totalDaysInMonth) * 100).toFixed(1),
    );
    const pacingAheadPercent = Number(
      (outflowPercent - pacingTargetPercent).toFixed(1),
    );
    const dailyRunBurn =
      remainingDays > 0 ? Number((safeSurplus / remainingDays).toFixed(2)) : 0;

    const totalOutflowNonZero = overallOutflow || 1;
    const needsPercent = Math.round((needsSpent / totalOutflowNonZero) * 100);
    const wantsPercent = Math.round((wantsSpent / totalOutflowNonZero) * 100);
    const savingsPercent = Math.max(0, 100 - needsPercent - wantsPercent);

    const dailySpend = new Map<number, number>();
    for (const txn of transactions) {
      const day = new Date(txn.transactionDate).getDate();
      dailySpend.set(day, (dailySpend.get(day) ?? 0) + Number(txn.amount));
    }
    let runningSpend = 0;
    const projectedSpend = Math.round(
      (overallOutflow / (currentDay || 1)) * totalDaysInMonth,
    );
    const actualAtCurrentDay = Array.from(dailySpend.entries())
      .filter(([day]) => day <= currentDay)
      .reduce((total, [, amount]) => total + amount, 0);
    const trajectoryPoints = Array.from({ length: totalDaysInMonth }, (_, index) => {
      const day = index + 1;
      const dailyOutflow = dailySpend.get(day) ?? 0;
      runningSpend += dailyOutflow;
      const isPastOrToday = day <= currentDay;
      return {
        day,
        label: String(day).padStart(2, "0"),
        actualBurn: isPastOrToday ? runningSpend : null,
        linearPlan: Number(((totalMasterBudget * day) / totalDaysInMonth).toFixed(2)),
        projectedClose: day >= currentDay
          ? currentDay >= totalDaysInMonth
            ? actualAtCurrentDay
            : Number((actualAtCurrentDay + ((projectedSpend - actualAtCurrentDay) * (day - currentDay)) / Math.max(1, totalDaysInMonth - currentDay)).toFixed(2))
          : null,
        dailyOutflow: isPastOrToday ? dailyOutflow : 0,
      };
    });

    return {
      period: periodString,
      envelopes,
      masterBudget: master
        ? { id: master.id, amountLimit: Number(master.amountLimit), notes: master.notes }
        : null,
      trajectoryPoints,
      metrics: {
        totalBudget: totalMasterBudget,
        envelopeCount: envelopes.length,
        totalOutflow: overallOutflow,
        outflowPercent,
        outflowTrendPercent: 0,
        safeSurplus,
        remainingDays,
        currentDay,
        totalDays: totalDaysInMonth,
        pacingGaugePercent: outflowPercent,
        pacingTargetPercent,
        pacingAheadPercent,
        overBudgetCount,
        overBudgetName: largestOverBudgetName || "None",
        overBudgetAmount: largestOverBudgetAmount,
        dailyRunBurn,
        projectedSpend,
        projectedSavings: Math.max(
          0,
          totalMasterBudget -
            projectedSpend,
        ),
      },
      fiftyThirtyTwenty: {
        needs: {
          spent: needsSpent,
          allocated: Math.round(totalMasterBudget * 0.5),
          actualPercent: needsPercent,
          targetPercent: 50,
          categories: ["Rent", "Groceries", "Utilities", "Health"],
        },
        wants: {
          spent: wantsSpent,
          allocated: Math.round(totalMasterBudget * 0.3),
          actualPercent: wantsPercent,
          targetPercent: 30,
          categories: ["Dining", "Shopping", "Entertainment"],
        },
        savings: {
          spent: Math.round(overallOutflow * 0.2),
          allocated: Math.round(totalMasterBudget * 0.2),
          actualPercent: savingsPercent,
          targetPercent: 20,
          categories: ["SIPs", "Emergency Buffer"],
        },
      },
    };
  }

  /**
   * Create or update a budget envelope
   */
  async create(userId: string, dto: CreateBudgetDTO): Promise<Budget> {
    if (dto.categoryId) {
      const category = await this.categoryRepository
        .createQueryBuilder("category")
        .where("category.id = :categoryId", { categoryId: dto.categoryId })
        .andWhere("category.type = :type", { type: CategoryType.EXPENSE })
        .andWhere("(category.userId = :userId OR category.isSystem = true)", { userId })
        .getOne();
      if (!category) {
        throw new BadRequestException("Select an expense category available to your account.");
      }
    }

    const existingQuery = this.budgetRepository
      .createQueryBuilder("budget")
      .where("budget.userId = :userId", { userId })
      .andWhere("budget.month = :month", { month: dto.month })
      .andWhere("budget.year = :year", { year: dto.year });
    if (dto.categoryId) {
      existingQuery.andWhere("budget.categoryId = :categoryId", { categoryId: dto.categoryId });
    } else {
      existingQuery.andWhere("budget.categoryId IS NULL");
    }
    const existing = await existingQuery.getOne();

    if (existing) {
      existing.amountLimit = dto.amountLimit;
      if (dto.alertThresholdPercent !== undefined) {
        existing.alertThresholdPercent = dto.alertThresholdPercent;
      }
      if (dto.ruleCategory) existing.ruleCategory = dto.ruleCategory;
      if (dto.categoryTag) existing.categoryTag = dto.categoryTag;
      if (dto.notes) existing.notes = dto.notes;
      return this.budgetRepository.save(existing);
    }

    const budget = this.budgetRepository.create({
      userId,
      categoryId: dto.categoryId || null,
      amountLimit: dto.amountLimit,
      month: dto.month,
      year: dto.year,
      alertThresholdPercent: dto.alertThresholdPercent ?? 80,
      ruleCategory: dto.ruleCategory ?? BudgetRuleCategory.WANTS,
      categoryTag: dto.categoryTag || null,
      notes: dto.notes || null,
    });

    return this.budgetRepository.save(budget);
  }

  /**
   * Update an existing budget envelope
   */
  async update(userId: string, id: string, dto: UpdateBudgetDTO): Promise<Budget> {
    const budget = await this.budgetRepository.findOne({
      where: { id, userId },
    });

    if (!budget) {
      throw new NotFoundException("Budget envelope not found.");
    }

    if (dto.amountLimit !== undefined) budget.amountLimit = dto.amountLimit;
    if (dto.alertThresholdPercent !== undefined) {
      budget.alertThresholdPercent = dto.alertThresholdPercent;
    }
    if (dto.ruleCategory) budget.ruleCategory = dto.ruleCategory;
    if (dto.categoryTag !== undefined) budget.categoryTag = dto.categoryTag;
    if (dto.notes !== undefined) budget.notes = dto.notes;

    return this.budgetRepository.save(budget);
  }

  /**
   * Reallocate funds from one envelope to another
   */
  async reallocate(userId: string, dto: ReallocateBudgetDTO) {
    if (dto.fromBudgetId === dto.toBudgetId) {
      throw new BadRequestException("Source and target envelopes must be different.");
    }

    return this.dataSource.transaction(async (manager) => {
      const fromBudget = await manager.findOne(Budget, {
        where: { id: dto.fromBudgetId, userId },
        lock: { mode: "pessimistic_write" },
      });
      const toBudget = await manager.findOne(Budget, {
        where: { id: dto.toBudgetId, userId },
        lock: { mode: "pessimistic_write" },
      });

      if (!fromBudget || !toBudget) {
        throw new NotFoundException("One or both budget envelopes were not found.");
      }
      if (
        fromBudget.month !== toBudget.month ||
        fromBudget.year !== toBudget.year ||
        !fromBudget.categoryId ||
        !toBudget.categoryId
      ) {
        throw new BadRequestException("Funds can only be moved between category envelopes in the same budget period.");
      }

      const fromLimit = Number(fromBudget.amountLimit);
      const periodStart = new Date(fromBudget.year, fromBudget.month - 1, 1);
      const periodEnd = new Date(fromBudget.year, fromBudget.month, 0, 23, 59, 59, 999);
      const sourceExpenses = await manager.find(Transaction, {
        where: {
          userId,
          categoryId: fromBudget.categoryId,
          type: TransactionType.EXPENSE,
          transactionDate: Between(periodStart, periodEnd),
        },
      });
      const spent = sourceExpenses.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
      const available = Math.max(0, fromLimit - spent);
      if (available < dto.amount) {
        throw new BadRequestException(
          `Cannot transfer ₹${dto.amount}. Source envelope only has ₹${available} available after spending.`,
        );
      }

      fromBudget.amountLimit = fromLimit - dto.amount;
      toBudget.amountLimit = Number(toBudget.amountLimit) + dto.amount;

      await manager.save(Budget, fromBudget);
      await manager.save(Budget, toBudget);

      return {
        success: true,
        message: `Transferred ₹${dto.amount} from ${fromBudget.categoryTag || "Source"} to ${toBudget.categoryTag || "Target"}.`,
        fromBudget,
        toBudget,
      };
    });
  }

  /**
   * Delete budget envelope
   */
  async remove(userId: string, id: string) {
    const budget = await this.budgetRepository.findOne({
      where: { id, userId },
    });

    if (!budget) {
      throw new NotFoundException("Budget envelope not found.");
    }

    await this.budgetRepository.remove(budget);
    return { success: true, message: "Budget envelope removed." };
  }

  /**
   * Quick KPI summary for current active budget run
   */
  async getSummary(userId: string) {
    const data = await this.findAll(userId, {});
    return data.metrics;
  }
}
