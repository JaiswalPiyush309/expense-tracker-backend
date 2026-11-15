-- Makes repeated Groww imports idempotent. NULL fingerprints remain allowed
-- for trades created outside an import.
ALTER TABLE "investment_transactions"
  ADD COLUMN "importFingerprint" varchar(64);

CREATE UNIQUE INDEX "IDX_investment_transactions_user_import_fingerprint"
  ON "investment_transactions" ("userId", "importFingerprint");
