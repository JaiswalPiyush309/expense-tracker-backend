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

  async processTradeBook(userId: string, fileBuffer: Buffer): Promise<ImportResult> {
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
      throw new BadRequestException("Groww export does not contain a worksheet.");
    }
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new BadRequestException(`Unable to read worksheet: ${sheetName}`);
    }

    // Parse sheet to JSON array
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

    for (const [index, row] of rows.entries()) {
      results.totalProcessed++;
      const symbol = this.readText(row, "Symbol", "Trading Symbol", "Stock Name");

      try {
        if (!symbol) {
          throw new Error("Missing Symbol.");
        }

        const rawType = this.readText(row, "Type", "Transaction Type")?.toUpperCase();
        const tradeType = this.parseTradeType(rawType);

        // Groww Trade Books usually denote MTF in the remarks or separate MTF sections.
        // Defaulting to DELIVERY. Adjust this logic based on your specific Groww export format.
        const remarks = this.readText(row, "Remarks", "Segment")?.toUpperCase() ?? "";
        const segment = remarks.includes("MTF")
          ? TradeSegment.MTF
          : TradeSegment.DELIVERY;

        const quantity = this.readNumber(row, "Quantity", "Qty");
        const executionPrice = this.readNumber(
          row,
          "Average Price",
          "Price",
          "Trade Price",
        );
        const tradeDate = this.readDate(row, "Date", "Trade Date", "Order Date");

        const tradeDto: CreateTradeDTO = {
          userId,
          tickerSymbol: symbol.toUpperCase(),
          tradeType,
          segment,
          quantity,
          executionPrice,
          chargesAndTaxes: this.readNumber(
            row,
            "Charges and Taxes",
            "Charges",
            "Taxes",
          ) ?? 0,
          tradeDate: tradeDate.toISOString(),
        };

        // Pass to the strict transactional service you built
        await this.investmentsService.processTrade(tradeDto);
        results.successful++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Row ${index + 1} failed for ${symbol ?? "unknown symbol"}: ${message}`,
        );
        results.failed++;
        results.errors.push({
          row: index + 1,
          symbol: symbol ?? "",
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

  private readDate(
    row: Record<string, unknown>,
    ...columns: string[]
  ): Date {
    const value = columns.map((column) => row[column]).find(
      (candidate) => candidate !== undefined && candidate !== null && candidate !== "",
    );

    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === "number") {
      const parsed = xlsx.SSF.parse_date_code(value);
      date = parsed
        ? new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S)
        : new Date(Number.NaN);
    } else {
      date = new Date(String(value ?? ""));
    }

    if (Number.isNaN(date.getTime())) {
      throw new Error(`${columns[0]} must be a valid date.`);
    }
    return date;
  }

  private parseTradeType(value: string | undefined): TradeType.BUY | TradeType.SELL {
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
