// Local type definitions — mirrors @finflow/types (workspace pkg not available on Vercel)

export type AccountCurrency = "USD" | "EUR" | "GBP" | "NGN";

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
