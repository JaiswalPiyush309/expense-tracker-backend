import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  AssetClass,
  InvestmentHolding,
} from "./entities/investment-holding.entity.js";
import { DataSource, IsNull, Not, Repository } from "typeorm";
import {
  InvestmentTransaction,
  TradeType,
} from "./entities/investment-transaction.entity.js";
import { CreateTradeDTO } from "./dto/create-trade.dto.js";
import { TradeSegment } from "./enums/transaction.enum.js";
import {
  HoldingResponseDTO,
  RecentActivityItemDTO,
  ShareMarketDashboardDTO,
} from "./interfaces/dashboard-metrics.interface.js";

@Injectable()
export class InvestmentsService {
  constructor(
    @InjectRepository(InvestmentHolding)
    private investmentHoldingRepository: Repository<InvestmentHolding>,

    @InjectRepository(InvestmentTransaction)
    private investmentTransactionRepository: Repository<InvestmentTransaction>,

    private dataSource: DataSource,
  ) {}

  async processTrade(dto: CreateTradeDTO): Promise<InvestmentTransaction> {
    const tradeDate = new Date(dto.tradeDate);
    if (Number.isNaN(tradeDate.getTime())) {
      throw new BadRequestException("tradeDate must be a valid ISO date.");
    }

    const tickerSymbol = dto.tickerSymbol.trim().toUpperCase();
    if (!tickerSymbol) {
      throw new BadRequestException("tickerSymbol must not be empty.");
    }

    // Execute within a database transaction to ensure ledger and holding stay in sync
    return this.dataSource.transaction(async (manager) => {
      // 1. Handle MTF Interest Deductions (No holding impact)
      if (dto.tradeType === TradeType.MTF_INTEREST) {
        this.assertNonNegativeNumber(dto.chargesAndTaxes, "chargesAndTaxes");

        const interestTx = manager.create(InvestmentTransaction, {
          userId: dto.userId,
          tradeType: TradeType.MTF_INTEREST,
          chargesAndTaxes: dto.chargesAndTaxes,
          tradeDate,
        });
        return manager.save(interestTx);
      }

      // Dividends affect the ledger but do not change share quantities.
      if (dto.tradeType === TradeType.DIVIDEND) {
        this.assertNonNegativeNumber(dto.quantity, "quantity");
        this.assertNonNegativeNumber(dto.executionPrice, "executionPrice");
        this.assertNonNegativeNumber(dto.chargesAndTaxes, "chargesAndTaxes");

        // 2. Find or Initialize the Portfolio Holding
        const holding = await manager.findOne(InvestmentHolding, {
          where: { userId: dto.userId, tickerSymbol },
        });

        return manager.save(
          manager.create(InvestmentTransaction, {
            userId: dto.userId,
            holdingId: holding?.id,
            tradeType: TradeType.DIVIDEND,
            quantity: dto.quantity,
            executionPrice: dto.executionPrice,
            chargesAndTaxes: dto.chargesAndTaxes ?? 0,
            tradeDate,
          }),
        );
      }

      if (dto.tradeType !== TradeType.BUY && dto.tradeType !== TradeType.SELL) {
        throw new BadRequestException(
          `Unsupported trade type: ${dto.tradeType}`,
        );
      }

      this.assertPositiveNumber(dto.quantity, "quantity");
      this.assertNonNegativeNumber(dto.executionPrice, "executionPrice");
      this.assertNonNegativeNumber(dto.chargesAndTaxes, "chargesAndTaxes");
      if (!dto.segment) {
        throw new BadRequestException(
          "segment is required for BUY and SELL trades.",
        );
      }

      // 2. Find or Initialize the Portfolio Holding
      let holding = await manager.findOne(InvestmentHolding, {
        where: { userId: dto.userId, tickerSymbol },
        lock: { mode: "pessimistic_write" },
      });

      if (!holding && dto.tradeType === TradeType.BUY) {
        holding = manager.create(InvestmentHolding, {
          userId: dto.userId,
          tickerSymbol,
          name: tickerSymbol, // Can be updated via a separate market data API later
          assetClass: AssetClass.EQUITY,
          deliveryQuantity: 0,
          mtfQuantity: 0,
          averagePrice: 0,
        });
      } else if (!holding && dto.tradeType === TradeType.SELL) {
        throw new NotFoundException(
          `Cannot sell ${tickerSymbol} - holding not found.`,
        );
      }

      if (!holding) {
        throw new BadRequestException(
          `Cannot process ${dto.tradeType} for ${tickerSymbol}.`,
        );
      }

      const quantity = dto.quantity as number;
      const executionPrice = dto.executionPrice as number;
      const chargesAndTaxes = dto.chargesAndTaxes ?? 0;
      const isMtf = dto.segment === TradeSegment.MTF;
      let realizedPnl: number | undefined;

      // 3. Process BUY Order
      if (dto.tradeType === TradeType.BUY) {
        const currentTotalQty =
          Number(holding.deliveryQuantity) + Number(holding.mtfQuantity);
        const currentInvested = currentTotalQty * Number(holding.averagePrice);
        const newInvested = quantity * executionPrice;

        // Calculate new Weighted Average Cost Basis (WACB)
        const newTotalQty = currentTotalQty + quantity;
        holding.averagePrice = (currentInvested + newInvested) / newTotalQty;

        if (isMtf) {
          holding.mtfQuantity = Number(holding.mtfQuantity) + quantity;
        } else {
          holding.deliveryQuantity =
            Number(holding.deliveryQuantity) + quantity;
        }
      }

      // 4. Process SELL Order
      else if (dto.tradeType === TradeType.SELL) {
        const availableQty = isMtf
          ? Number(holding.mtfQuantity)
          : Number(holding.deliveryQuantity);

        if (availableQty < quantity) {
          throw new BadRequestException(
            `Insufficient ${dto.segment} quantity for ${tickerSymbol}. Available: ${availableQty}`,
          );
        }

        if (isMtf) {
          holding.mtfQuantity = Number(holding.mtfQuantity) - quantity;
        } else {
          holding.deliveryQuantity =
            Number(holding.deliveryQuantity) - quantity;
        }

        // Calculate Realized Profit/Loss: (Sell Price - Buy Avg Price) * Qty - Charges
        const grossPnl =
          (executionPrice - Number(holding.averagePrice)) * quantity;
        realizedPnl = grossPnl - chargesAndTaxes;
      }

      // 5. Update Aggregate Holding Values
      const finalTotalQty =
        Number(holding.deliveryQuantity) + Number(holding.mtfQuantity);
      holding.investedAmount = finalTotalQty * Number(holding.averagePrice);

      // Save Holding
      const savedHolding = await manager.save(holding);

      // 6. Record the Transaction Ledger Entry
      const transaction = manager.create(InvestmentTransaction, {
        userId: dto.userId,
        holdingId: savedHolding.id,
        tradeType: dto.tradeType,
        segment: dto.segment,
        quantity: dto.quantity,
        executionPrice: dto.executionPrice,
        chargesAndTaxes,
        ...(realizedPnl === undefined ? {} : { realizedPnl }),
        tradeDate,
      });

      return manager.save(transaction);
    });
  }

  async getDashboardMetrics(userId: string): Promise<ShareMarketDashboardDTO> {
    // 1. Fetch Current Holdings
    const holdings = await this.investmentHoldingRepository.find({
      where: { userId },
    });

    // 2. Fetch Realized P&L from Sell Transactions
    const sellTransactions = await this.investmentTransactionRepository.find({
      where: {
        userId,
        tradeType: TradeType.SELL,
        realizedPnl: Not(IsNull()),
      },
    });

    // 3. Calculate Core KPIs
    let totalInvestment = 0;
    let portfolioValue = 0;

    // In a real scenario, today's P&L requires fetching live LTP minus yesterday's close.
    // We will initialize it to 0 for the base schema.
    const todaysPnl = 0;

    // Calculate Asset Allocation grouped by categoryTag (e.g., Large Cap, Mid Cap)
    // Fall back to assetClass when categoryTag is null/empty
    const allocationMap = new Map<string, number>();

    holdings.forEach((holding) => {
      const invested = Number(holding.investedAmount);
      // When currentValue is 0, treat as equal to investedAmount (zero unrealized P&L)
      const current =
        Number(holding.currentValue) > 0
          ? Number(holding.currentValue)
          : invested;

      totalInvestment += invested;
      portfolioValue += current;

      // Grouping for the Donut Chart — fall back to assetClass if no categoryTag
      const category =
        holding.categoryTag && holding.categoryTag.trim() !== ""
          ? holding.categoryTag
          : holding.assetClass || "Uncategorized";
      allocationMap.set(category, (allocationMap.get(category) || 0) + current);
    });

    const unrealizedPnl = portfolioValue - totalInvestment;
    const realizedPnl = sellTransactions.reduce(
      (sum, tx) => sum + Number(tx.realizedPnl),
      0,
    );
    const totalReturns = unrealizedPnl + realizedPnl;

    // Format Asset Allocation for the frontend
    const assetAllocation = Array.from(allocationMap.entries())
      .map(([category, value]) => ({
        category,
        value,
        percentage:
          portfolioValue > 0
            ? Number(((value / portfolioValue) * 100).toFixed(2))
            : 0,
      }))
      .sort((a, b) => b.value - a.value); // Sort largest to smallest

    // 4. Generate Portfolio Growth Chart Data from real transactions
    const portfolioGrowth = await this.generateGrowthData(userId);

    // 5. Fetch last 5 BUY + SELL + DIVIDEND transactions for recent activity
    const recentTransactions = await this.investmentTransactionRepository.find({
      where: [
        { userId, tradeType: TradeType.BUY },
        { userId, tradeType: TradeType.SELL },
        { userId, tradeType: TradeType.DIVIDEND },
      ],
      order: { tradeDate: "DESC" },
      take: 5,
      relations: ["holding"],
    });

    const recentActivity: RecentActivityItemDTO[] = recentTransactions.map(
      (tx) => ({
        id: tx.id,
        tradeType: tx.tradeType,
        tickerSymbol: tx.holding?.tickerSymbol ?? tx.holding?.name ?? "",
        quantity: Number(tx.quantity ?? 0),
        executionPrice: Number(tx.executionPrice ?? 0),
        tradeDate: tx.tradeDate,
        realizedPnl: Number(tx.realizedPnl ?? 0),
        broker: tx.broker,
      }),
    );

    // 6. Top 5 holdings by investedAmount DESC
    const topHoldingsRaw = await this.investmentHoldingRepository.find({
      where: { userId },
      order: { investedAmount: "DESC" },
      take: 5,
    });

    const topHoldings: HoldingResponseDTO[] = topHoldingsRaw.map((h) =>
      this.mapHoldingToDTO(h),
    );

    return {
      kpis: {
        totalInvestment,
        portfolioValue,
        totalReturns,
        realizedPnl,
        unrealizedPnl,
        todaysPnl,
        activePositionsCount: holdings.length,
        closedPositionsCount: sellTransactions.length,
      },
      assetAllocation,
      portfolioGrowth,
      recentActivity,
      topHoldings,
    };
  }

  // Real portfolio growth data built from transaction history
  private async generateGrowthData(
    userId: string,
  ): Promise<{ date: string; invested: number; currentValue: number }[]> {
    const transactions = await this.investmentTransactionRepository.find({
      where: { userId },
      order: { tradeDate: "ASC" },
    });

    if (transactions.length === 0) {
      return [];
    }

    // Build running monthly aggregation
    const monthlyMap = new Map<
      string,
      { invested: number; currentValue: number }
    >();

    let runningInvested = 0;

    for (const tx of transactions) {
      const date = new Date(tx.tradeDate);
      const monthKey = date.toLocaleString("en-US", {
        month: "short",
        year: "2-digit",
      }); // e.g. "Nov '26"
      const formattedKey = `${date.toLocaleString("en-US", { month: "short" })} '${String(date.getFullYear()).slice(-2)}`;

      const amount =
        Number(tx.quantity ?? 0) * Number(tx.executionPrice ?? 0);

      if (tx.tradeType === TradeType.BUY) {
        runningInvested += amount;
      } else if (tx.tradeType === TradeType.SELL) {
        runningInvested -= amount;
        if (runningInvested < 0) runningInvested = 0;
      }
      // DIVIDEND and MTF_INTEREST don't change invested principal

      monthlyMap.set(formattedKey, {
        invested: runningInvested,
        // No live price feed: currentValue = investedAmount as safe fallback
        currentValue: runningInvested,
      });
    }

    return Array.from(monthlyMap.entries()).map(([date, values]) => ({
      date,
      ...values,
    }));
  }

  // Public: get all holdings for a user mapped to HoldingResponseDTO
  async getHoldings(userId: string): Promise<HoldingResponseDTO[]> {
    const holdings = await this.investmentHoldingRepository.find({
      where: { userId },
      order: { investedAmount: "DESC" },
    });

    return holdings.map((h) => this.mapHoldingToDTO(h));
  }

  private mapHoldingToDTO(holding: InvestmentHolding): HoldingResponseDTO {
    const invested = Number(holding.investedAmount);
    const current =
      Number(holding.currentValue) > 0
        ? Number(holding.currentValue)
        : invested;

    const unrealizedPnl = current > 0 ? current - invested : 0;
    const totalReturnsPercent =
      invested > 0 && current > 0
        ? ((current - invested) / invested) * 100
        : 0;

    return {
      id: holding.id,
      tickerSymbol: holding.tickerSymbol ?? "",
      name: holding.name,
      assetClass: holding.assetClass,
      deliveryQuantity: Number(holding.deliveryQuantity),
      mtfQuantity: Number(holding.mtfQuantity),
      averagePrice: Number(holding.averagePrice),
      investedAmount: invested,
      currentValue: current,
      unrealizedPnl,
      totalReturnsPercent,
    };
  }

  private assertPositiveNumber(
    value: number | undefined,
    field: string,
  ): asserts value is number {
    if (value === undefined || !Number.isFinite(value) || value <= 0) {
      throw new BadRequestException(`${field} must be a positive number.`);
    }
  }

  private assertNonNegativeNumber(
    value: number | undefined,
    field: string,
  ): asserts value is number | undefined {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new BadRequestException(`${field} must be a non-negative number.`);
    }
  }
}
