export interface DashboardSummaryResponse {
  period: {
    month: number;
    year: number;
    monthLabel: string; // e.g., "April 2025"
    shortMonthLabel: string; // e.g., "APR"
  };

  netWorthBanner: {
    totalNetWorth: number; // e.g., 3482450
    yoyChangePercent: number; // e.g., 12.4
  };

  liquidBalance: {
    totalAmount: number; // e.g., 482650.00
    momChangePercent: number; // e.g., 2.1
    linkedAccountsCount: number; // e.g., 4
    accountNames: string[]; // e.g., ["HDFC", "ICICI", "SBI", "Paytm"]
    isReconciled: boolean; // e.g., true
  };

  income: {
    totalAmount: number; // e.g., 215000.00
    momChangePercent: number; // e.g., 8.5
    topSources: { categoryName: string; amount: number }[]; // e.g., [{ categoryName: "Salary", amount: 185000 }, { categoryName: "Consulting", amount: 30000 }]
  };

  expenses: {
    totalAmount: number; // e.g., 78420.00
    momChangePercent: number; // e.g., -4.2
    budgetLimit: number; // e.g., 150000
    budgetSpentPercent: number; // e.g., 52.3
    statusLabel: string; // e.g., "Well inside limit"
  };

  netCashFlow: {
    netAmount: number; // e.g., 136580.00
    savingsRatePercent: number; // e.g., 63.5
    targetSavingsRatePercent: number; // e.g., 50.0
    isTargetHit: boolean; // e.g., true
  };

  equitiesAndMfs: {
    currentValue: number; // e.g., 2845200.00
    investedAmount: number; // e.g., 2503100.00
    totalPnL: number; // e.g., 342100.00
    pnlPercent: number; // e.g., 13.68
    focusTags: string[]; // e.g., ["Nifty 50", "Midcap Focus"]
    isLiveSync: boolean; // e.g., true
  };

  moneyLent: {
    totalReceivable: number; // e.g., 125000.00
    overdueCount: number; // e.g., 1
    topOverdueItem: { counterpartyName: string; amount: number } | null; // e.g., { counterpartyName: "Rahul", amount: 50000 }
    activeBorrowersCount: number; // e.g., 3
  };

  moneyBorrowed: {
    totalLiability: number; // e.g., 35000.00
    nextDueItem: {
      counterpartyName: string;
      daysRemaining: number;
      dueDate: string;
      note: string;
    } | null; // e.g., { counterpartyName: "Amit S.", daysRemaining: 15, note: "0% Interest Friendly Loan" }
  };

  sipsAndAutoDebits: {
    totalMonthlyCommitment: number; // e.g., 45000.00
    executedThisMonthCount: number; // e.g., 3
    totalActiveRulesCount: number; // e.g., 3
    nextExecutionDate: string | null; // e.g., "2025-05-02"
    highlightTitles: string[]; // e.g., ["PPF", "UTI Index"]
  };
}
