-- Migration: Personal Ledgers enhancements & Repayments Table
-- Date: 2026-11-20

-- 1. Ensure personal_ledgers base table exists (in case not created by TypeORM)
CREATE TABLE IF NOT EXISTS "personal_ledgers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" VARCHAR(20) NOT NULL,
  "counterpartyName" VARCHAR(100) NOT NULL,
  "principalAmount" NUMERIC(12, 2) NOT NULL,
  "settledAmount" NUMERIC(12, 2) NOT NULL DEFAULT 0,
  "interestRate" NUMERIC(5, 2) NOT NULL DEFAULT 0,
  "dueDate" DATE,
  "description" VARCHAR(150),
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add member-linking and contact fields to personal_ledgers if missing
ALTER TABLE "personal_ledgers"
  ADD COLUMN IF NOT EXISTS "counterpartyUserId" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "counterpartyEmail" VARCHAR(150),
  ADD COLUMN IF NOT EXISTS "counterpartyPhone" VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "relationship" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "lentDate" DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS "sourceAccountId" UUID,
  ADD COLUMN IF NOT EXISTS "sourceAccountName" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- 3. Create indexes for quick counterparty search and member lookups
CREATE INDEX IF NOT EXISTS "IDX_personal_ledgers_counterpartyUserId" ON "personal_ledgers" ("counterpartyUserId");
CREATE INDEX IF NOT EXISTS "IDX_personal_ledgers_counterpartyEmail" ON "personal_ledgers" ("counterpartyEmail");
CREATE INDEX IF NOT EXISTS "IDX_personal_ledgers_counterpartyPhone" ON "personal_ledgers" ("counterpartyPhone");
CREATE INDEX IF NOT EXISTS "IDX_personal_ledgers_user_type_status" ON "personal_ledgers" ("userId", "type", "status");

-- 4. Create Repayment Mode Enum if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'personal_ledger_repayments_paymentmode_enum') THEN
    CREATE TYPE "personal_ledger_repayments_paymentmode_enum" AS ENUM ('UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE');
  END IF;
END $$;

-- 5. Create personal_ledger_repayments table
CREATE TABLE IF NOT EXISTS "personal_ledger_repayments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ledgerId" UUID NOT NULL REFERENCES "personal_ledgers"("id") ON DELETE CASCADE,
  "recordedByUserId" UUID NOT NULL REFERENCES "users"("id") ON DELETE SET NULL,
  "amount" NUMERIC(12, 2) NOT NULL,
  "paymentDate" DATE NOT NULL,
  "paymentMode" "personal_ledger_repayments_paymentmode_enum" NOT NULL DEFAULT 'UPI',
  "referenceId" VARCHAR(100),
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_ledger_repayments_ledger_date" ON "personal_ledger_repayments" ("ledgerId", "paymentDate");
