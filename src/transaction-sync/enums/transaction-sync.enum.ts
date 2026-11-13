export enum TransactionPlatform {
  ANDROID = "ANDROID",
  IOS = "IOS",
}

export enum TransactionSourceType {
  NOTIFICATION = "NOTIFICATION",
  ACCOUNT_AGGREGATOR = "ACCOUNT_AGGREGATOR",
  BANK_IMPORT = "BANK_IMPORT",
}

export enum TransactionSourceApp {
  GOOGLE_PAY = "GOOGLE_PAY",
  PHONEPE = "PHONEPE",
  PAYTM = "PAYTM",
  BHIM = "BHIM",
  CRED = "CRED",
  BANK_UPI = "BANK_UPI",
  OTHER = "OTHER",
}

export enum TransactionDirection {
  DEBIT = "DEBIT",
  CREDIT = "CREDIT",
}

export enum ImportedTransactionStatus {
  PENDING = "PENDING",
  PROCESSED = "PROCESSED",
  REVIEW_REQUIRED = "REVIEW_REQUIRED",
  FAILED = "FAILED",
}
