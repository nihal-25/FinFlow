import { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "@finflow/database";
import { acquireLock } from "@finflow/redis";
import { publishEvent } from "@finflow/kafka";
import { KAFKA_TOPICS } from "@finflow/types";
import type { Transaction, AccountCurrency, PaginatedResult } from "@finflow/types";
import {
  NotFoundError,
  InsufficientFundsError,
  ValidationError,
} from "../utils/errors";
import { config } from "../config";

function notifyAnalytics(tenantId: string, event: string, data: unknown): void {
  const url = config.ANALYTICS_SERVICE_URL;
  if (!url) return;
  fetch(`${url}/internal/transaction-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, event, data }),
  }).catch((err: unknown) => console.error("[analytics-notify] Failed:", (err as Error).message));
}

interface TransactionRow {
  id: string;
  tenant_id: string;
  source_account_id: string;
  destination_account_id: string;
  amount: string;
  currency: AccountCurrency;
  status: string;
  idempotency_key: string;
  description: string | null;
  metadata: Record<string, unknown>;
  failure_reason: string | null;
  processed_at: Date | null;
  reversed_at: Date | null;
  reversal_of_id: string | null;
  created_at: Date;
  updated_at: Date;
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceAccountId: row.source_account_id,
    destinationAccountId: row.destination_account_id,
    amount: row.amount,
    currency: row.currency,
    status: row.status as Transaction["status"],
    idempotencyKey: row.idempotency_key,
    description: row.description,
    metadata: row.metadata,
    failureReason: row.failure_reason,
    processedAt: row.processed_at,
    reversedAt: row.reversed_at,
    reversalOfId: row.reversal_of_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateTransactionInput {
  tenantId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  currency: AccountCurrency;
  idempotencyKey: string;
  description?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export async function createTransaction(
  input: CreateTransactionInput
): Promise<{ transaction: Transaction; isIdempotentReplay: boolean }> {
  // 1. Check idempotency — return existing if duplicate key
  const existing = await queryOne<TransactionRow>(
    `SELECT * FROM transactions WHERE idempotency_key = $1 AND tenant_id = $2`,
    [input.idempotencyKey, input.tenantId]
  );
  if (existing) {
    return { transaction: toTransaction(existing), isIdempotentReplay: true };
  }

  // 2. Acquire distributed locks on both accounts (sorted to prevent deadlock)
  const lockIds = [input.sourceAccountId, input.destinationAccountId].sort();
  const lock1 = await acquireLock(`account:${lockIds[0]}`, 30_000);
  if (!lock1) throw new ValidationError("Could not acquire lock on account. Please retry.");

  const lock2 = await acquireLock(`account:${lockIds[1]}`, 30_000);
  if (!lock2) {
    await lock1.release();
    throw new ValidationError("Could not acquire lock on account. Please retry.");
  }

  try {
    // 3. Execute within a PostgreSQL transaction with row-level locking
    const transaction = await withTransaction(async (client) => {
      return processTransaction(client, input);
    });

    // Notify analytics-service to emit Socket.io event for live feed
    notifyAnalytics(input.tenantId, "transaction:completed", {
      transaction,
      timestamp: new Date().toISOString(),
    });

    // 4. Publish events to Kafka (fire-and-forget — DB is source of truth)
    publishEvent(KAFKA_TOPICS.TRANSACTIONS_CREATED, {
      eventType: "transaction.created",
      tenantId: input.tenantId,
      payload: { transaction },
    }).catch((err: unknown) => console.error("[kafka] Failed to publish transaction.created:", (err as Error).message));

    publishEvent(KAFKA_TOPICS.TRANSACTIONS_COMPLETED, {
      eventType: "transaction.completed",
      tenantId: input.tenantId,
      payload: {
        transaction,
        sourceBalanceAfter: "0",
        destinationBalanceAfter: "0",
      },
    }).catch((err: unknown) => console.error("[kafka] Failed to publish transaction.completed:", (err as Error).message));

    return { transaction, isIdempotentReplay: false };
  } finally {
    await lock1.release();
    await lock2.release();
  }
}

async function processTransaction(
  client: PoolClient,
  input: CreateTransactionInput
): Promise<Transaction> {
  const { sourceAccountId, destinationAccountId, amount, tenantId, currency } = input;

  // Lock both accounts with SELECT FOR UPDATE
  interface AccountLockRow {
    id: string; tenant_id: string; is_active: boolean; currency: AccountCurrency;
  }
  const accounts = await client.query<AccountLockRow>(
    `SELECT id, tenant_id, is_active, currency FROM accounts
     WHERE id = ANY($1::uuid[]) AND tenant_id = $2
     ORDER BY id
     FOR UPDATE`,
    [[sourceAccountId, destinationAccountId], tenantId]
  );

  if (accounts.rows.length !== 2) {
    throw new NotFoundError("One or both accounts");
  }

  const sourceAccount = accounts.rows.find((a) => a.id === sourceAccountId);
  const destAccount = accounts.rows.find((a) => a.id === destinationAccountId);

  if (!sourceAccount?.is_active || !destAccount?.is_active) {
    throw new ValidationError("One or both accounts are inactive");
  }

  if (sourceAccount.currency !== currency || destAccount.currency !== currency) {
    throw new ValidationError("Account currency mismatch");
  }

  // Compute source account balance from ledger
  const balanceResult = await client.query<{ balance: string }>(
    `SELECT COALESCE(
       SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0
     )::TEXT AS balance
     FROM ledger_entries WHERE account_id = $1`,
    [sourceAccountId]
  );

  const sourceBalance = parseFloat(balanceResult.rows[0]?.balance ?? "0");
  const txAmount = parseFloat(amount);

  if (sourceBalance < txAmount) {
    // Create failed transaction record
    const failedTx = await client.query<TransactionRow>(
      `INSERT INTO transactions
         (tenant_id, source_account_id, destination_account_id, amount, currency, status, idempotency_key, description, metadata, failure_reason)
       VALUES ($1, $2, $3, $4, $5, 'failed', $6, $7, $8, 'Insufficient funds')
       RETURNING *`,
      [
        tenantId, sourceAccountId, destinationAccountId, amount, currency,
        input.idempotencyKey, input.description ?? null, JSON.stringify(input.metadata ?? {}),
      ]
    );

    const tx = failedTx.rows[0];
    if (!tx) throw new Error("Failed to insert transaction record");

    publishEvent(KAFKA_TOPICS.TRANSACTIONS_FAILED, {
      eventType: "transaction.failed",
      tenantId,
      payload: { transaction: toTransaction(tx), reason: "Insufficient funds" },
    }).catch((err: unknown) => console.error("[kafka] Failed to publish transaction.failed:", (err as Error).message));

    throw new InsufficientFundsError();
  }

  // Create transaction record (pending → processing → completed)
  const txResult = await client.query<TransactionRow>(
    `INSERT INTO transactions
       (tenant_id, source_account_id, destination_account_id, amount, currency,
        status, idempotency_key, description, metadata, processed_at)
     VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, NOW())
     RETURNING *`,
    [
      tenantId, sourceAccountId, destinationAccountId, amount, currency,
      input.idempotencyKey, input.description ?? null, JSON.stringify(input.metadata ?? {}),
    ]
  );

  const tx = txResult.rows[0];
  if (!tx) throw new Error("Failed to insert transaction record");

  // Compute balances for ledger entries
  const destBalanceResult = await client.query<{ balance: string }>(
    `SELECT COALESCE(
       SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END), 0
     )::TEXT AS balance
     FROM ledger_entries WHERE account_id = $1`,
    [destinationAccountId]
  );
  const destBalance = parseFloat(destBalanceResult.rows[0]?.balance ?? "0");

  // Double-entry: debit source, credit destination
  await client.query(
    `INSERT INTO ledger_entries (transaction_id, account_id, type, amount, balance_before, balance_after)
     VALUES
       ($1, $2, 'debit',  $3, $4, $5),
       ($1, $6, 'credit', $3, $7, $8)`,
    [
      tx.id, sourceAccountId, amount,
      sourceBalance.toFixed(8), (sourceBalance - txAmount).toFixed(8),
      destinationAccountId,
      destBalance.toFixed(8), (destBalance + txAmount).toFixed(8),
    ]
  );

  return toTransaction(tx);
}

export async function getTransactionById(id: string, tenantId: string): Promise<Transaction> {
  const row = await queryOne<TransactionRow>(
    `SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!row) throw new NotFoundError("Transaction");
  return toTransaction(row);
}

export interface ListTransactionsOptions {
  tenantId: string;
  status?: string | undefined;
  accountId?: string | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export async function listTransactions(
  options: ListTransactionsOptions
): Promise<PaginatedResult<Transaction>> {
  const { tenantId, status, accountId, fromDate, toDate, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;
  const params: unknown[] = [tenantId];
  const conditions: string[] = ["tenant_id = $1"];

  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (accountId) {
    params.push(accountId);
    conditions.push(`(source_account_id = $${params.length} OR destination_account_id = $${params.length})`);
  }
  if (fromDate) { params.push(fromDate); conditions.push(`created_at >= $${params.length}`); }
  if (toDate) { params.push(toDate); conditions.push(`created_at <= $${params.length}`); }

  const where = conditions.join(" AND ");

  const [rows, countResult] = await Promise.all([
    query<TransactionRow>(
      `SELECT * FROM transactions WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM transactions WHERE ${where}`,
      params
    ),
  ]);

  const total = parseInt(countResult?.count ?? "0", 10);
  return {
    items: rows.map(toTransaction),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function reverseTransaction(
  transactionId: string,
  tenantId: string,
  idempotencyKey: string
): Promise<Transaction> {
  const original = await queryOne<TransactionRow>(
    `SELECT * FROM transactions WHERE id = $1 AND tenant_id = $2`,
    [transactionId, tenantId]
  );

  if (!original) throw new NotFoundError("Transaction");
  if (original.status !== "completed") {
    throw new ValidationError("Only completed transactions can be reversed");
  }

  // Create reversal transaction (swap source/destination)
  const reversal = await createTransaction({
    tenantId,
    sourceAccountId: original.destination_account_id,
    destinationAccountId: original.source_account_id,
    amount: original.amount,
    currency: original.currency as AccountCurrency,
    idempotencyKey,
    description: `Reversal of transaction ${transactionId}`,
    metadata: { reversalOfId: transactionId },
  });

  // Mark original as reversed
  await query(
    `UPDATE transactions SET status = 'reversed', reversed_at = NOW() WHERE id = $1`,
    [transactionId]
  );

  return reversal.transaction;
}
