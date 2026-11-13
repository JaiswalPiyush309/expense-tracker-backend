export interface AssetAllocationDTO {
  category: string;
  value: number;
  percentage: number;
}

export interface ChartDataPointDTO {
  date: string;
  invested: number;
  currentValue: number;
}

export interface RecentActivityItemDTO {
  id: string;
  tradeType: string;
  tickerSymbol: string;
  quantity: number;
  executionPrice: number;
  tradeDate: Date;
  realizedPnl: number;
  broker: string;
}

export interface HoldingResponseDTO {
  id: string;
  tickerSymbol: string;
  name: string;
  assetClass: string;
  deliveryQuantity: number;
  mtfQuantity: number;
  averagePrice: number;
  investedAmount: number;
  currentValue: number;
  unrealizedPnl: number;
  totalReturnsPercent: number;
}

export interface ShareMarketDashboardDTO {
  kpis: {
    totalInvestment: number;
    portfolioValue: number;
    totalReturns: number;
    realizedPnl: number;
    unrealizedPnl: number;
    todaysPnl: number; // Requires live market data, typically 0 if market closed
    activePositionsCount: number;
    closedPositionsCount: number;
  };
  assetAllocation: AssetAllocationDTO[];
  portfolioGrowth: ChartDataPointDTO[];
  recentActivity: RecentActivityItemDTO[];
  topHoldings: HoldingResponseDTO[];
}
