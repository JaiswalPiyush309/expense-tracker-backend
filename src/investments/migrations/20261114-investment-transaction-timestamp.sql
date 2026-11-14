-- Apply once before deploying the entity change. Existing date-only rows are
-- preserved as midnight UTC; new rows retain their exact transaction time.
ALTER TABLE "investment_transactions"
  ALTER COLUMN "tradeDate" TYPE timestamptz
  USING "tradeDate"::timestamp AT TIME ZONE 'UTC';
