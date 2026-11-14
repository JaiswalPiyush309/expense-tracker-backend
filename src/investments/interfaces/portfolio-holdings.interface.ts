export interface HoldingSummaryDTO {
  id: string;
  name: string;
  tickerSymbol: string;
  quantity: number;
  averagePrice: number;
  investedAmount: number;
  currentLtp: number;
  currentValue: number;
  unrealizedPnl: number;
  pnlPercentage: number;
  portfolioWeight: number; // For the Top 3 Concentration metric
}

export interface PortfolioHoldingsResponseDTO {
  kpis: {
    totalInvested: number;
    currentValue: number;
    unrealizedPnl: number;
    overallReturnPercentage: number;
    totalHoldingsCount: number;
    activeHoldingsCount: number;
  };
  allocations: {
    sectors: Record<string, number>; // e.g., { 'Tech': 32, 'Energy': 25 }
    marketCaps: Record<string, number>; // e.g., { 'Large': 48, 'Mid': 26.5 }
  };
  holdings: HoldingSummaryDTO[];
}
