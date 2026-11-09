import { BadRequestException, Injectable } from "@nestjs/common";
import { TransactionType } from "./entities/transaction.entity.js";
import * as XLSX from "xlsx";

export interface ParsedRawRow {
  transactionDate: Date;
  merchant: string;
  amount: number;
  type: TransactionType;
  externalTransactionId: string | null;
  utr: string | null;
  rawInstrument: string | null;
  accountNumberLast4: string | null;
}

@Injectable()
export class StatementParserService {
  parse(buffer: Buffer, upiApp?: string, bankCode?: string): ParsedRawRow[] {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (upiApp === "PHONEPE") {
      return this.parsePhonePe(rawData);
    }

    // Fallback generic CSV/XLSX parser with standard headers
    return this.parseGeneric(rawData);
  }

  private parsePhonePe(data: any[][]): ParsedRawRow[] {
    // PhonePe has metadata in the top 3 rows; headers start at row index 3
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i].map((c) =>
        String(c || "")
          .trim()
          .toLowerCase(),
      );
      if (row.includes("transaction id") && row.includes("amount")) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      throw new BadRequestException(
        "Invalid PhonePe statement format. Required columns missing.",
      );
    }

    const headers = data[headerRowIdx].map((c) => String(c || "").trim());
    const dateIdx = headers.findIndex((h) => /^date$/i.test(h));
    const timeIdx = headers.findIndex((h) => /^time$/i.test(h));
    const detailsIdx = headers.findIndex((h) => /transaction details/i.test(h));
    const txIdIdx = headers.findIndex((h) => /transaction id/i.test(h));
    const utrIdx = headers.findIndex((h) => /utr/i.test(h));
    const typeIdx = headers.findIndex((h) => /transaction type/i.test(h));
    const instrumentIdx = headers.findIndex((h) => /instrument/i.test(h));
    const amountIdx = headers.findIndex((h) => /^amount$/i.test(h));

    const results: ParsedRawRow[] = [];

    for (let r = headerRowIdx + 1; r < data.length; r++) {
      const row = data[r];
      if (!row || !row[txIdIdx]) continue; // Skip disclaimer footers or empty rows

      const txId = String(row[txIdIdx]).trim();
      const rawType = String(row[typeIdx] || "")
        .trim()
        .toUpperCase();
      const rawAmount = parseFloat(String(row[amountIdx]).replace(/,/g, ""));
      if (isNaN(rawAmount)) continue;

      // Extract last 4 digits from instrument (e.g., "Credited to XXXXX9500004574")
      const instrumentStr = String(row[instrumentIdx] || "").trim();
      const last4Match = instrumentStr.match(/(\d{4})$/);
      const last4 = last4Match ? last4Match[1] : null;

      // Parse Date & Time
      const rawDate = row[dateIdx];
      const rawTime = String(row[timeIdx] || "00:00:00").trim();
      let txDate = new Date();
      if (rawDate instanceof Date) {
        txDate = new Date(rawDate);
      } else {
        txDate = new Date(`${rawDate} ${rawTime}`);
      }

      const txType =
        rawType === "CREDIT" ? TransactionType.INCOME : TransactionType.EXPENSE;
      const merchant = String(row[detailsIdx] || "UPI Transaction")
        .replace(/^(Paid to|Received from)\s+/i, "")
        .trim();

      results.push({
        transactionDate: txDate,
        merchant,
        amount: Math.abs(rawAmount),
        type: txType,
        externalTransactionId: txId,
        utr: row[utrIdx] ? String(row[utrIdx]).trim() : null,
        rawInstrument: instrumentStr,
        accountNumberLast4: last4,
      });
    }

    return results;
  }

  private parseGeneric(data: any[][]): ParsedRawRow[] {
    // Basic fallback for generic statements
    return [];
  }
}
