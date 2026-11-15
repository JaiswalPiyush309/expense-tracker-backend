import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InvestmentsService } from "./investments.service.js";
import * as xlsx from "xlsx";
import { TradeType } from "./entities/investment-transaction.entity.js";
import { TradeSegment } from "./enums/transaction.enum.js";
import { CreateTradeDTO } from "./dto/create-trade.dto.js";

@Injectable()
export class GrowwImportService {
  private readonly logger = new Logger(GrowwImportService.name);

  constructor(private readonly investmentsService: InvestmentsService) {}

  async processTradeBook(
    userId: string,
    fileBuffer: Buffer,
  ): Promise<ImportResult> {
    if (!userId?.trim()) {
      throw new BadRequestException("userId is required.");
    }
    if (!fileBuffer?.length) {
      throw new BadRequestException("Groww export file is empty.");
    }

    const workbook = xlsx.read(fileBuffer, {
      type: "buffer",
      cellDates: true,
    });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException(
        "Groww export does not contain a worksheet.",
      );
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new BadRequestException(`Unable to read worksheet: ${sheetName}`);
    }

    // Read as a 2D array first to find where the actual table starts
    const rawRows = xlsx.utils.sheet_to_json<any[]>(sheet, { header: 1 });
    const headerRowIndex = rawRows.findIndex((row) =>
      row.some(
        (cell) =>
          String(cell).toLowerCase().includes("symbol") ||
          String(cell).toLowerCase().includes("stock name"),
      ),
    );

    if (headerRowIndex === -1) {
      throw new BadRequestException(
        "Invalid format: Could not find 'Symbol' or 'Stock name' header row.",
      );
    }

    // Re-parse the sheet starting exactly from the header row
    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: undefined,
      raw: true,
    });

    const results = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      errors: [] as { row: number; symbol: string; error: string }[],
    };

    // --- IMPROVEMENT 2: Phase 1 - Parse and Filter ---
    const parsedTrades: CreateTradeDTO[] = [];

    for (const [index, row] of rows.entries()) {
      results.totalProcessed++;

      // Skip non-executed orders
      const status = this.readText(
        row,
        "Order status",
        "Status",
      )?.toUpperCase();

      if (status && status !== "EXECUTED") {
        continue;
      }

      const symbol = this.readText(
        row,
        "Symbol",
        "Trading Symbol",
        "Stock Name",
      );

      try {
        if (!symbol) {
          throw new Error("Missing Symbol.");
        }

        const rawType = this.readText(
          row,
          "Type",
          "Transaction Type",
        )?.toUpperCase();

        const tradeType = this.parseTradeType(rawType);

        // Groww Trade Books usually denote MTF in the remarks or separate MTF sections.
        // Defaulting to DELIVERY. Adjust this logic based on your specific Groww export format.
        const remarks =
          this.readText(
            row,
            "Remarks",
            "Segment",
            "Order type",
          )?.toUpperCase() ?? "";

        const segment = remarks.includes("MTF")
          ? TradeSegment.MTF
          : TradeSegment.DELIVERY;

        const quantity = this.readNumber(row, "Quantity", "Qty");

        // Adjusted to fall back to 'Value' / 'Quantity' if 'Average Price' is missing
        let executionPrice = this.readNumber(
          row,
          "Average Price",
          "Price",
          "Trade Price",
        );

        if (executionPrice === undefined) {
          const totalValue = this.readNumber(row, "Value", "Order Value");
          if (totalValue !== undefined && quantity)
            executionPrice = totalValue / quantity;
        }

        const tradeDate = this.readDate(
          row,
          "Execution date and time",
          "Date",
          "Trade Date",
          "Order Date",
        );

        parsedTrades.push({
          userId,
          tickerSymbol: symbol.toUpperCase(),
          tradeType,
          segment,
          quantity: quantity as number,
          executionPrice: executionPrice as number,
          chargesAndTaxes:
            this.readNumber(row, "Charges and Taxes", "Charges", "Taxes") ?? 0,
          tradeDate: tradeDate.toISOString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Parsing failed at row ${index + 1} for ${symbol ?? "unknown symbol"}: ${message}`,
        );
        results.failed++;
        results.errors.push({
          row: index + 1,
          symbol: symbol ?? "",
          error: message,
        });
      }
    }

    // --- Sort Chronologically (Oldest first) ---
    parsedTrades.sort(
      (a, b) =>
        new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime(),
    );

    // --- Execute Database Transactions ---
    for (const trade of parsedTrades) {
      try {
        await this.investmentsService.processTrade(trade);
        results.successful++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Database processing failed for ${trade.tickerSymbol}: ${message}`,
        );
        results.failed++;
        results.errors.push({
          row: -1,
          symbol: trade.tickerSymbol,
          error: message,
        });
      }
    }
    return results;
  }

  private readText(
    row: Record<string, unknown>,
    ...columns: string[]
  ): string | undefined {
    for (const column of columns) {
      const value = row[column];
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return undefined;
  }

  private readNumber(
    row: Record<string, unknown>,
    ...columns: string[]
  ): number | undefined {
    const value = this.readText(row, ...columns)?.replace(/[₹,]/g, "");
    if (value === undefined || value === "") {
      return undefined;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${columns[0]} must be a valid number.`);
    }
    return parsed;
  }

  private readDate(row: Record<string, unknown>, ...columns: string[]): Date {
    const value = columns
      .map((column) => row[column])
      .find(
        (candidate) =>
          candidate !== undefined && candidate !== null && candidate !== "",
      );

    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === "number") {
      const parsed = xlsx.SSF.parse_date_code(value);
      date = parsed
        ? new Date(
            parsed.y,
            parsed.m - 1,
            parsed.d,
            parsed.H,
            parsed.M,
            parsed.S,
          )
        : new Date(Number.NaN);
    } else {
      date = new Date(String(value ?? ""));
    }

    if (Number.isNaN(date.getTime())) {
      throw new Error(`${columns[0]} must be a valid date.`);
    }
    return date;
  }

  private parseTradeType(
    value: string | undefined,
  ): TradeType.BUY | TradeType.SELL {
    if (value?.includes("BUY")) {
      return TradeType.BUY;
    }
    if (value?.includes("SELL")) {
      return TradeType.SELL;
    }
    throw new Error("Type must identify a BUY or SELL transaction.");
  }
}

export interface ImportResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  errors: { row: number; symbol: string; error: string }[];
}
