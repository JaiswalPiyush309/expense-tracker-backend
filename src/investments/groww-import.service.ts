import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InvestmentsService } from "./investments.service.js";
import * as xlsx from "xlsx";
import { TradeType } from "./entities/investment-transaction.entity.js";
import { TradeSegment } from "./enums/transaction.enum.js";
import { CreateTradeDTO } from "./dto/create-trade.dto.js";
import { createHash } from "node:crypto";

@Injectable()
export class GrowwImportService {
  private readonly logger = new Logger(GrowwImportService.name);

  constructor(private readonly investmentsService: InvestmentsService) {}

  async processTradeBook(
    userId: string,
    fileBuffer: Buffer,
    accountId?: string,
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

    // --- Bulletproof Header Detection ---
    const rawRows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: true,
    });

    const headerRowIndex = rawRows.findIndex(
      (row) =>
        Array.isArray(row) &&
        row.some((cell) => {
          const val = String(cell || "")
            .toLowerCase()
            .trim();
          return val === "symbol" || val === "stock name";
        }),
    );

    if (headerRowIndex === -1) {
      throw new BadRequestException(
        "Invalid format: Could not find 'Symbol' or 'Stock name' header row.",
      );
    }

    // Extract headers and validate that this is a trade book.
    const headers = rawRows[headerRowIndex].map((h) => String(h || "").trim());
    const normalizedHeaders = new Set(headers.map((h) => h.toLowerCase()));
    const hasAny = (...names: string[]) =>
      names.some((name) => normalizedHeaders.has(name.toLowerCase()));
    const missing = [
      !hasAny("Symbol", "Trading Symbol", "Stock Name") && "symbol",
      !hasAny("Type", "Transaction Type") && "type",
      !hasAny("Quantity", "Qty") && "quantity",
      !hasAny(
        "Average Price",
        "Price",
        "Trade Price",
        "Value",
        "Order Value",
      ) && "price/value",
      !hasAny("Execution date and time", "Date", "Trade Date", "Order Date") &&
        "date",
    ].filter((value): value is string => Boolean(value));
    if (missing.length) {
      throw new BadRequestException(
        `Invalid Groww trade book: missing required column(s): ${missing.join(", ")}.`,
      );
    }
    const dataRows = rawRows.slice(headerRowIndex + 1);

    const rows = dataRows
      .map((row, index) => ({ row, worksheetRow: headerRowIndex + index + 2 }))
      .filter(
        ({ row }) =>
          Array.isArray(row) && row.some((cell) => cell != null && cell !== ""),
      )
      .map(({ row, worksheetRow }) => {
        const obj: Record<string, unknown> = {};
        headers.forEach((header, i) => {
          if (header) obj[header] = row[i];
        });
        return { values: obj, worksheetRow };
      });

    const results = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: [] as { row: number; symbol: string; error: string }[],
    };

    // --- PHASE 1: Extract and Map (Do not save to DB yet) ---
    const parsedTrades: { trade: CreateTradeDTO; row: number }[] = [];

    for (const { values: row, worksheetRow } of rows) {
      const status = this.readText(
        row,
        "Order status",
        "Status",
      )?.toUpperCase();

      if (status && status !== "EXECUTED" && status !== "SUCCESS") {
        results.skipped++;
        continue;
      }
      results.totalProcessed++;

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
        if (quantity === undefined || quantity <= 0) {
          throw new Error("Quantity must be a positive number.");
        }

        let executionPrice = this.readNumber(
          row,
          "Average Price",
          "Price",
          "Trade Price",
        );

        if (executionPrice === undefined) {
          const totalValue = this.readNumber(row, "Value", "Order Value");
          if (totalValue !== undefined && quantity) {
            executionPrice = totalValue / quantity;
          }
        }
        if (executionPrice === undefined || executionPrice < 0) {
          throw new Error("Average Price must be a non-negative number.");
        }

        const tradeDate = this.readDate(
          row,
          "Execution date and time",
          "Date",
          "Trade Date",
          "Order Date",
        );

        // Push to array instead of processing immediately
        const trade: CreateTradeDTO = {
          userId,
          tickerSymbol: symbol.toUpperCase(),
          tradeType,
          segment,
          quantity: quantity as number,
          executionPrice: executionPrice as number,
          chargesAndTaxes:
            this.readNumber(row, "Charges and Taxes", "Charges", "Taxes") ?? 0,
          tradeDate: tradeDate.toISOString(),
          accountId,
        };
        trade.importFingerprint = this.createFingerprint(trade, worksheetRow);
        parsedTrades.push({ trade, row: worksheetRow });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Parsing failed at row ${worksheetRow} for ${symbol ?? "unknown symbol"}: ${message}`,
        );
        results.failed++;
        results.errors.push({
          row: worksheetRow,
          symbol: symbol ?? "",
          error: message,
        });
      }
    }

    // --- PHASE 2: Sort Chronologically and Process ---
    // Ensure older trades are processed before newer trades
    parsedTrades.sort(
      (a, b) =>
        new Date(a.trade.tradeDate).getTime() -
        new Date(b.trade.tradeDate).getTime(),
    );

    for (const { trade, row } of parsedTrades) {
      try {
        await this.investmentsService.processTrade(trade);
        results.successful++;
      } catch (error: unknown) {
        if (this.isUniqueConstraintError(error)) {
          results.skipped++;
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Database processing failed at row ${row} for ${trade.tickerSymbol}: ${message}`,
        );
        results.failed++;
        results.errors.push({
          row,
          symbol: trade.tickerSymbol,
          error: message,
        });
      }
    }

    return results;
  }

  private createFingerprint(
    trade: CreateTradeDTO,
    worksheetRow: number,
  ): string {
    const identity = [
      trade.userId,
      trade.tickerSymbol,
      trade.tradeType,
      trade.segment,
      trade.quantity,
      trade.executionPrice,
      trade.chargesAndTaxes,
      trade.tradeDate,
      worksheetRow,
    ].join("|");
    return createHash("sha256").update(identity).digest("hex");
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as {
      code?: string;
      constraint?: string;
      driverError?: { code?: string; constraint?: string };
    };
    return (
      (candidate.code === "23505" || candidate.driverError?.code === "23505") &&
      (candidate.constraint ===
        "IDX_investment_transactions_user_import_fingerprint" ||
        candidate.driverError?.constraint ===
          "IDX_investment_transactions_user_import_fingerprint")
    );
  }

  private readText(
    row: Record<string, unknown>,
    ...columns: string[]
  ): string | undefined {
    const rowKeys = Object.keys(row);

    for (const column of columns) {
      // Find the key in the row that matches case-insensitively

      const actualKey = rowKeys.find(
        (k) => k.toLowerCase() === column.toLowerCase(),
      );
      if (actualKey) {
        const value = row[actualKey];
        if (value !== undefined && value !== null && String(value).trim()) {
          return String(value).trim();
        }
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
    const rowKeys = Object.keys(row);
    let value: unknown;
    let foundColumn: string = columns[0];

    for (const column of columns) {
      const actualKey = rowKeys.find(
        (k) => k.toLowerCase() === column.toLowerCase(),
      );
      if (
        actualKey &&
        row[actualKey] !== undefined &&
        row[actualKey] !== null &&
        row[actualKey] !== ""
      ) {
        value = row[actualKey];
        foundColumn = actualKey;
        break;
      }
    }

    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === "number") {
      const parsed = xlsx.SSF.parse_date_code(value);
      date = parsed
        ? new Date(
            Date.UTC(
              parsed.y,
              parsed.m - 1,
              parsed.d,
              parsed.H,
              parsed.M,
              parsed.S,
            ),
          )
        : new Date(Number.NaN);
    } else {
      const dateStr = String(value ?? "").trim();

      // Regex to capture DD-MM-YYYY or DD/MM/YYYY with optional time (HH:MM PM/AM)
      const regex =
        /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/;
      const match = dateStr.match(regex);

      if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // JS months are 0-indexed
        const year = parseInt(match[3], 10);

        let hours = match[4] ? parseInt(match[4], 10) : 0;
        const minutes = match[5] ? parseInt(match[5], 10) : 0;
        const seconds = match[6] ? parseInt(match[6], 10) : 0;
        const ampm = match[7]?.toUpperCase();

        if (ampm === "PM" && hours < 12) hours += 12;
        if (ampm === "AM" && hours === 12) hours = 0;

        // Use Date.UTC to prevent local timezone offsets from pushing the date back by 1 day at midnight
        date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
      } else {
        // Fallback for native ISO formats
        date = new Date(dateStr);
      }
    }

    if (Number.isNaN(date.getTime())) {
      throw new Error(`${foundColumn} must be a valid date.`);
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
  skipped: number;
  errors: { row: number; symbol: string; error: string }[];
}
