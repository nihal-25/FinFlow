export type AccountType = "wallet" | "escrow" | "reserve";
export type AccountCurrency = "USD" | "EUR" | "GBP" | "NGN";

export interface Account {
  id: string;
  tenantId: string;
  name: string;
  type: AccountType;
  currency: AccountCurrency;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountWithBalance extends Account {
  balance: string;
}

export type TransactionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "reversed"
  | "flagged";

export interface Transaction {
  id: string;
  tenantId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: AccountCurrency;
  status: TransactionStatus;
  idempotencyKey: string;
  description: string | null;
  metadata: Record<string, unknown>;
  failureReason: string | null;
  processedAt: Date | null;
  reversedAt: Date | null;
  reversalOfId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type LedgerEntryType = "debit" | "credit";

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  type: LedgerEntryType;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  createdAt: Date;
}

export type FraudAlertStatus = "open" | "investigating" | "resolved" | "dismissed";
export type FraudRuleTriggered =
  | "velocity_check"
  | "amount_anomaly"
  | "large_transaction"
  | "round_tripping";

export interface FraudAlert {
  id: string;
  tenantId: string;
  transactionId: string;
  accountId: string;
  rulesTriggered: FraudRuleTriggered[];
  riskScore: number;
  status: FraudAlertStatus;
  metadata: Record<string, unknown>;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  isActive: boolean;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookDeliveryStatus = "pending" | "success" | "failed";

export interface WebhookDelivery {
  id: string;
  webhookEndpointId: string;
  event: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attemptNumber: number;
  responseCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  deliveredAt: Date | null;
  nextRetryAt: Date | null;
  createdAt: Date;
}
