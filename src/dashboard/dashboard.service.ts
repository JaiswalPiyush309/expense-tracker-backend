import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { DashboardQueryDTO } from "./dto/dashboard-query.dto.js";
import { DashboardSummaryResponse } from "./dto/dashboard-response.dto.js";
import { RecurringRule } from "../transactions/entities/recurring-rule.entity.js";
import {
  LedgerStatus,
  LedgerType,
  PersonalLedger,
} from "../ledgers/entities/personal-ledger.entity.js";
import { InvestmentHolding } from "../investments/entities/investment-holding.entity.js";
import {
  Transaction,
  TransactionType,
} from "../transactions/entities/transaction.entity.js";
import { Budget } from "../budgets/entities/budget.entity.js";
import { Account, AccountType } from "../accounts/entities/account.entity.js";

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async getDashboardSummary(
    userId: string,
    query: DashboardQueryDTO,
  ): Promise<DashboardSummaryResponse> {
    const now = new Date();
    const month = query.month ?? now.getMonth() + 1;
    const year = query.year ?? now.getFullYear();

    // Current month date boundaries
    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    // Use an exclusive upper bound. This avoids dropping timestamps with
    // precision finer than milliseconds at the end of the month.
    const endOfMonth = new Date(Date.UTC(year, month, 1));

    // Previous month date boundaries for MoM % calculation
    const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
    const startOfPrevMonth = new Date(
      Date.UTC(
        prevMonthDate.getUTCFullYear(),
        prevMonthDate.getUTCMonth(),
        1,
        0,
        0,
        0,
      ),
    );
    const endOfPrevMonth = new Date(
      Date.UTC(
        prevMonthDate.getUTCFullYear(),
        prevMonthDate.getUTCMonth() + 1,
        1,
      ),
    );

    const [
      liquidData,
      incomeData,
      expenseData,
      investmentData,
      lentData,
      borrowedData,
      sipData,
    ] = await Promise.all([
      this.getLiquidBalanceMetrics(userId, startOfMonth, endOfMonth),
      this.getIncomeMetrics(
        userId,
        startOfMonth,
        endOfMonth,
        startOfPrevMonth,
        endOfPrevMonth,
      ),
      this.getExpenseMetrics(
        userId,
        month,
        year,
        startOfMonth,
        endOfMonth,
        startOfPrevMonth,
        endOfPrevMonth,
      ),
      this.getInvestmentMetrics(userId),
      this.getMoneyLentMetrics(userId),
      this.getMoneyBorrowedMetrics(userId),
      this.getSipAndAutoDebitMetrics(userId, startOfMonth, endOfMonth),
    ]);

    // Net Cash Flow & Savings Rate Calculation (Widget 4)
    const netCashFlowAmount = Number(
      (incomeData.totalAmount - expenseData.totalAmount).toFixed(2),
    );
    const savingsRatePercent =
      incomeData.totalAmount > 0
        ? Number(
            ((netCashFlowAmount / incomeData.totalAmount) * 100).toFixed(1),
          )
        : 0;
    const targetSavingsRatePercent = 50; // Can also be pulled from user_settings

    // Unified Net Worth Calculation (Header Banner)
    // Net Worth = Liquid Balance + Investments + Money Lent - Money Borrowed
    const totalNetWorth = Number(
      (
        liquidData.totalAmount +
        investmentData.currentValue +
        lentData.totalReceivable -
        borrowedData.totalLiability
      ).toFixed(2),
    );

    const periodDate = new Date(Date.UTC(year, month - 1, 1));
    const monthLabel = periodDate.toLocaleString("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    const shortMonthLabel = periodDate
      .toLocaleString("en-IN", { month: "short", timeZone: "UTC" })
      .toUpperCase();

    return {
      period: { month, year, monthLabel, shortMonthLabel },
      netWorthBanner: {
        totalNetWorth,
        // Historical account/holding snapshots are not currently persisted.
        // Do not expose a made-up percentage until they are available.
        yoyChangePercent: 0,
      },
      liquidBalance: liquidData,
      income: incomeData,
      expenses: expenseData,
      netCashFlow: {
        netAmount: netCashFlowAmount,
        savingsRatePercent,
        targetSavingsRatePercent,
        isTargetHit: savingsRatePercent >= targetSavingsRatePercent,
      },
      equitiesAndMfs: investmentData,
      moneyLent: lentData,
      moneyBorrowed: borrowedData,
      sipsAndAutoDebits: sipData,
    };
  }

  private async getLiquidBalanceMetrics(
    userId: string,
    startOfMonth: Date,
    endOfMonth: Date,
  ) {
    const accounts = await this.dataSource.getRepository(Account).find({
      where: { userId, isArchived: false },
      order: { balance: "DESC" },
    });

    const liquidAccounts = accounts.filter((a) =>
      [AccountType.BANK, AccountType.CASH, AccountType.WALLET].includes(a.type),
    );

    const totalAmount = liquidAccounts.reduce(
      (sum, a) => sum + Number(a.balance),
      0,
    );

    // Calculate net flow this month to derive prior month's ending liquid balance for MoM %
    const monthFlow = await this.dataSource
      .getRepository(Transaction)
      .createQueryBuilder("tx")
      .select(
        `SUM(CASE WHEN tx.type = 'INCOME' THEN tx.amount WHEN tx.type = 'EXPENSE' THEN -tx.amount ELSE 0 END)`,
        "netChange",
      )
      .where("tx.userId = :userId", { userId })
      .andWhere("tx.transactionDate >= :start AND tx.transactionDate < :end", {
        start: startOfMonth,
        end: endOfMonth,
      })
      .getRawOne();

    const netChange = Number(monthFlow?.netChange ?? 0);
    const priorBalance = totalAmount - netChange;
    const momChangePercent =
      priorBalance > 0
        ? Number(((netChange / priorBalance) * 100).toFixed(1))
        : 0;

    return {
      totalAmount: Number(totalAmount.toFixed(2)),
      momChangePercent,
      linkedAccountsCount: liquidAccounts.length,
      accountNames: liquidAccounts.slice(0, 4).map((a) => a.name),
      isReconciled: true,
    };
  }

  private async getIncomeMetrics(
    userId: string,
    startOfMonth: Date,
    endOfMonth: Date,
    startOfPrevMonth: Date,
    endOfPrevMonth: Date,
  ) {
    const txRepo = this.dataSource.getRepository(Transaction);

    const [currentRows, prevRaw] = await Promise.all([
      txRepo
        .createQueryBuilder("tx")
        .leftJoin("tx.category", "cat")
        .select("COALESCE(cat.name, 'Other')", "categoryName")
        .addSelect("SUM(tx.amount)", "amount")
        .where("tx.userId = :userId", { userId })
        .andWhere("tx.type = :type", { type: TransactionType.INCOME })
        .andWhere("tx.transactionDate >= :start AND tx.transactionDate < :end", {
          start: startOfMonth,
          end: endOfMonth,
        })
        .groupBy("cat.name")
        .orderBy("SUM(tx.amount)", "DESC")
        .getRawMany(),
      txRepo
        .createQueryBuilder("tx")
        .select("COALESCE(SUM(tx.amount), 0)", "total")
        .where("tx.userId = :userId", { userId })
        .andWhere("tx.type = :type", { type: TransactionType.INCOME })
        .andWhere("tx.transactionDate >= :start AND tx.transactionDate < :end", {
          start: startOfPrevMonth,
          end: endOfPrevMonth,
        })
        .getRawOne(),
    ]);

    const totalAmount = currentRows.reduce(
      (sum, r) => sum + Number(r.amount),
      0,
    );
    const prevTotal = Number(prevRaw?.total ?? 0);
    const momChangePercent =
      prevTotal > 0
        ? Number((((totalAmount - prevTotal) / prevTotal) * 100).toFixed(1))
        : 0;

    return {
      totalAmount: Number(totalAmount.toFixed(2)),
      momChangePercent,
      topSources: currentRows.slice(0, 2).map((r) => ({
        categoryName: r.categoryName,
        amount: Number(r.amount),
      })),
    };
  }

  private async getExpenseMetrics(
    userId: string,
    month: number,
    year: number,
    startOfMonth: Date,
    endOfMonth: Date,
    startOfPrevMonth: Date,
    endOfPrevMonth: Date,
  ) {
    const txRepo = this.dataSource.getRepository(Transaction);
    const budgetRepo = this.dataSource.getRepository(Budget);

    const [currentRaw, prevRaw, budgets] = await Promise.all([
      txRepo
        .createQueryBuilder("tx")
        .select("COALESCE(SUM(tx.amount), 0)", "total")
        .where("tx.userId = :userId", { userId })
        .andWhere("tx.type = :type", { type: TransactionType.EXPENSE })
        .andWhere("tx.transactionDate >= :start AND tx.transactionDate < :end", {
          start: startOfMonth,
          end: endOfMonth,
        })
        .getRawOne(),
      txRepo
        .createQueryBuilder("tx")
        .select("COALESCE(SUM(tx.amount), 0)", "total")
        .where("tx.userId = :userId", { userId })
        .andWhere("tx.type = :type", { type: TransactionType.EXPENSE })
        .andWhere("tx.transactionDate >= :start AND tx.transactionDate < :end", {
          start: startOfPrevMonth,
          end: endOfPrevMonth,
        })
        .getRawOne(),
      budgetRepo.find({ where: { userId, month, year } }),
    ]);

    const totalAmount = Number(currentRaw?.total ?? 0);
    const prevTotal = Number(prevRaw?.total ?? 0);
    const momChangePercent =
      prevTotal > 0
        ? Number((((totalAmount - prevTotal) / prevTotal) * 100).toFixed(1))
        : 0;

    // Overall budget (categoryId = null) or sum of category budgets
    const overallBudget = budgets.find((b) => b.categoryId === null);
    const budgetLimit = overallBudget
      ? Number(overallBudget.amountLimit)
      : budgets.reduce((sum, b) => sum + Number(b.amountLimit), 0);

    const budgetSpentPercent =
      budgetLimit > 0
        ? Number(((totalAmount / budgetLimit) * 100).toFixed(1))
        : 0;

    let statusLabel = "No budget set";
    if (budgetLimit > 0) {
      if (budgetSpentPercent <= 75) statusLabel = "Well inside limit";
      else if (budgetSpentPercent <= 100) statusLabel = "Nearing limit";
      else statusLabel = "Over budget";
    }

    return {
      totalAmount: Number(totalAmount.toFixed(2)),
      momChangePercent,
      budgetLimit: Number(budgetLimit.toFixed(2)),
      budgetSpentPercent,
      statusLabel,
    };
  }

  private async getInvestmentMetrics(userId: string) {
    const holdings = await this.dataSource
      .getRepository(InvestmentHolding)
      .find({ where: { userId } });

    const investedAmount = holdings.reduce(
      (s, h) => s + Number(h.investedAmount),
      0,
    );
    const currentValue = holdings.reduce(
      (s, h) => s + Number(h.currentValue),
      0,
    );
    const totalPnL = Number((currentValue - investedAmount).toFixed(2));
    const pnlPercent =
      investedAmount > 0
        ? Number(((totalPnL / investedAmount) * 100).toFixed(2))
        : 0;

    const focusTags = Array.from(
      new Set(holdings.map((h) => h.categoryTag).filter(Boolean)),
    ).slice(0, 2);

    return {
      currentValue: Number(currentValue.toFixed(2)),
      investedAmount: Number(investedAmount.toFixed(2)),
      totalPnL,
      pnlPercent,
      focusTags,
      isLiveSync: holdings.some((h) => h.isLiveSync),
    };
  }

  private async getMoneyLentMetrics(userId: string) {
    const records = await this.dataSource.getRepository(PersonalLedger).find({
      where: { userId, type: LedgerType.LENT },
      order: { dueDate: "ASC" },
    });

    const activeRecords = records.filter(
      (r) => r.status !== LedgerStatus.SETTLED,
    );
    const totalReceivable = activeRecords.reduce(
      (sum, r) => sum + (Number(r.principalAmount) - Number(r.settledAmount)),
      0,
    );

    const today = new Date();
    const overdueRecords = activeRecords.filter(
      (r) => r.dueDate && new Date(r.dueDate) < today,
    );

    const topOverdue = overdueRecords[0]
      ? {
          counterpartyName: overdueRecords[0].counterpartyName,
          amount:
            Number(overdueRecords[0].principalAmount) -
            Number(overdueRecords[0].settledAmount),
        }
      : null;

    const uniqueBorrowers = new Set(
      activeRecords
        .map((r) => r.counterpartyName?.trim().toLowerCase())
        .filter(Boolean),
    ).size;

    return {
      totalReceivable: Number(totalReceivable.toFixed(2)),
      overdueCount: overdueRecords.length,
      topOverdueItem: topOverdue,
      activeBorrowersCount: uniqueBorrowers,
    };
  }

  private async getMoneyBorrowedMetrics(userId: string) {
    const records = await this.dataSource.getRepository(PersonalLedger).find({
      where: { userId, type: LedgerType.BORROWED },
      order: { dueDate: "ASC" },
    });

    const activeRecords = records.filter(
      (r) => r.status !== LedgerStatus.SETTLED,
    );
    const totalLiability = activeRecords.reduce(
      (sum, r) => sum + (Number(r.principalAmount) - Number(r.settledAmount)),
      0,
    );

    const today = new Date();
    const upcoming = activeRecords
      .filter((r) => r.dueDate !== null)
      .sort(
        (a, b) =>
          new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime(),
      )[0];

    let nextDueItem = null;
    if (upcoming && upcoming.dueDate) {
      const due = new Date(upcoming.dueDate);
      const diffDays = Math.ceil(
        (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      nextDueItem = {
        counterpartyName: upcoming.counterpartyName,
        daysRemaining: diffDays,
        dueDate: upcoming.dueDate.toString(),
        note:
          upcoming.description ||
          `${Number(upcoming.interestRate)}% Interest Friendly Loan`,
      };
    }

    return {
      totalLiability: Number(totalLiability.toFixed(2)),
      nextDueItem,
    };
  }

  private async getSipAndAutoDebitMetrics(
    userId: string,
    startOfMonth: Date,
    endOfMonth: Date,
  ) {
    const rules = await this.dataSource.getRepository(RecurringRule).find({
      where: { userId, isActive: true },
      order: { nextExecutionDate: "ASC" },
    });

    const totalMonthlyCommitment = rules.reduce(
      (sum, r) => sum + Number(r.monthlyAmount),
      0,
    );

    const executedThisMonthCount = rules.filter((r) => {
      if (!r.lastExecutedAt) return false;
      const execDate = new Date(r.lastExecutedAt);
      return execDate >= startOfMonth && execDate < endOfMonth;
    }).length;

    return {
      totalMonthlyCommitment: Number(totalMonthlyCommitment.toFixed(2)),
      executedThisMonthCount,
      totalActiveRulesCount: rules.length,
      nextExecutionDate: rules[0]?.nextExecutionDate
        ? rules[0].nextExecutionDate.toString()
        : null,
      highlightTitles: rules.slice(0, 2).map((r) => r.title),
    };
  }
}
