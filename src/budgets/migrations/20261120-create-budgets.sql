-- Migration: Budgets and Category Envelopes Table
-- Date: 2026-11-20

-- 1. Create Budget Rule Category Enum if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'budgets_rulecategory_enum') THEN
    CREATE TYPE "budgets_rulecategory_enum" AS ENUM ('NEEDS', 'WANTS', 'SAVINGS');
  END IF;
END $$;

-- 2. Create budgets table if not exists
CREATE TABLE IF NOT EXISTS "budgets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "categoryId" UUID REFERENCES "categories"("id") ON DELETE CASCADE,
  "amountLimit" NUMERIC(12, 2) NOT NULL,
  "month" INT NOT NULL,
  "year" INT NOT NULL,
  "alertThresholdPercent" INT NOT NULL DEFAULT 80,
  "ruleCategory" "budgets_rulecategory_enum" NOT NULL DEFAULT 'WANTS',
  "categoryTag" VARCHAR(80),
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_budgets_user_category_month_year" UNIQUE ("userId", "categoryId", "month", "year")
);

-- 3. Add columns to budgets if table already existed previously without them
ALTER TABLE "budgets"
  ADD COLUMN IF NOT EXISTS "ruleCategory" "budgets_rulecategory_enum" NOT NULL DEFAULT 'WANTS',
  ADD COLUMN IF NOT EXISTS "categoryTag" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- 4. Create search indexes
CREATE INDEX IF NOT EXISTS "IDX_budgets_user_year_month" ON "budgets" ("userId", "year", "month");
CREATE INDEX IF NOT EXISTS "IDX_budgets_categoryId" ON "budgets" ("categoryId");
