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
import { DataSource, Repository } from "typeorm";
import {
  InvestmentTransaction,
  TradeType,
} from "./entities/investment-transaction.entity.js";
import { CreateTradeDTO } from "./dto/create-trade.dto.js";
import { TradeSegment } from "./enums/transaction.enum.js";

@Injectable()
export class InvestmentsService {
  constructor(
    @InjectRepository(InvestmentHolding)
    private holdingRepo: Repository<InvestmentHolding>,

    @InjectRepository(InvestmentTransaction)
    private transactionRepo: Repository<InvestmentTransaction>,

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
        throw new BadRequestException(`Unsupported trade type: ${dto.tradeType}`);
      }

      this.assertPositiveNumber(dto.quantity, "quantity");
      this.assertNonNegativeNumber(dto.executionPrice, "executionPrice");
      this.assertNonNegativeNumber(dto.chargesAndTaxes, "chargesAndTaxes");
      if (!dto.segment) {
        throw new BadRequestException("segment is required for BUY and SELL trades.");
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
          holding.mtfQuantity =
            Number(holding.mtfQuantity) + quantity;
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
          holding.deliveryQuantity = Number(holding.deliveryQuantity) - quantity;
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
