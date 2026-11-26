-- Migration: Debt & Repayment Transactions (Borrow, Lend, Repayments)
-- Date: 2026-11-26

-- 1. Extend transactions_type_enum with new types
ALTER TYPE "transactions_type_enum" ADD VALUE IF NOT EXISTS 'INVESTMENT';
ALTER TYPE "transactions_type_enum" ADD VALUE IF NOT EXISTS 'BORROW';
ALTER TYPE "transactions_type_enum" ADD VALUE IF NOT EXISTS 'BORROW_REPAYMENT';
ALTER TYPE "transactions_type_enum" ADD VALUE IF NOT EXISTS 'LEND';
ALTER TYPE "transactions_type_enum" ADD VALUE IF NOT EXISTS 'LEND_REPAYMENT';

-- 2. Create SettlementStatus enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactions_settlementstatus_enum') THEN
    CREATE TYPE "transactions_settlementstatus_enum" AS ENUM ('OPEN', 'PARTIAL', 'SETTLED');
  END IF;
END $$;

-- 3. Add debt tracking columns to transactions table
ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "counterpartyName" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "parentTransactionId" UUID REFERENCES "transactions"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "settlementStatus" "transactions_settlementstatus_enum",
  ADD COLUMN IF NOT EXISTS "remainingAmount" NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS "repaymentAllocations" JSONB;

-- 4. Indexes for open debt queries and parent lookups
CREATE INDEX IF NOT EXISTS "IDX_transactions_user_type_settlement"
  ON "transactions" ("userId", "type", "settlementStatus");
CREATE INDEX IF NOT EXISTS "IDX_transactions_parentTransactionId"
  ON "transactions" ("parentTransactionId");
