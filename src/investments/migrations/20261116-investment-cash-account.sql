-- Links investment activity to the account whose cash balance it changes.
ALTER TABLE "investment_transactions"
  ADD COLUMN "accountId" uuid;

ALTER TABLE "investment_transactions"
  ADD CONSTRAINT "FK_investment_transactions_account"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL;
