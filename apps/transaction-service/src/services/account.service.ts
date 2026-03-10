import { query, queryOne, withTransaction } from "@finflow/database";
import type { Account, AccountCurrency, AccountType } from "@finflow/types";
import { NotFoundError, ValidationError } from "../utils/errors";

interface AccountRow {
  id: string;
  tenant_id: string;
  name: string;
  type: AccountType;
  currency: AccountCurrency;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface AccountWithBalanceRow extends AccountRow {
  balance: string;
}

export interface CreateAccountInput {
  tenantId: string;
  name: string;
  type: AccountType;
  currency: AccountCurrency;
  metadata?: Record<string, unknown> | undefined;
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    type: row.type,
    currency: row.currency,
    isActive: row.is_active,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const row = await queryOne<AccountRow>(
    `INSERT INTO accounts (tenant_id, name, type, currency, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.tenantId, input.name, input.type, input.currency, JSON.stringify(input.metadata ?? {})]
  );
  if (!row) throw new Error("Failed to create account");
  return toAccount(row);
}

export async function listAccounts(tenantId: string): Promise<AccountWithBalanceRow[]> {
  return query<AccountWithBalanceRow>(
    `SELECT a.*,
       COALESCE(
         SUM(CASE WHEN le.type = 'credit' THEN le.amount ELSE -le.amount END),
         0
       )::TEXT AS balance
     FROM accounts a
     LEFT JOIN ledger_entries le ON le.account_id = a.id
     WHERE a.tenant_id = $1 AND a.is_active = TRUE
     GROUP BY a.id
     ORDER BY a.created_at DESC`,
    [tenantId]
  );
}

export async function getAccountById(id: string, tenantId: string): Promise<Account> {
  const row = await queryOne<AccountRow>(
    `SELECT * FROM accounts WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!row) throw new NotFoundError("Account");
  return toAccount(row);
}

export async function getAccountBalance(accountId: string, tenantId: string): Promise<string> {
  // Ensure account belongs to tenant
  const account = await queryOne<{ id: string }>(
    `SELECT id FROM accounts WHERE id = $1 AND tenant_id = $2`,
    [accountId, tenantId]
  );
  if (!account) throw new NotFoundError("Account");

  const result = await queryOne<{ balance: string }>(
    `SELECT COALESCE(
       SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END),
       0
     )::TEXT AS balance
     FROM ledger_entries
     WHERE account_id = $1`,
    [accountId]
  );
  return result?.balance ?? "0";
}

export async function depositFunds(
  accountId: string,
  tenantId: string,
  amount: string,
  description?: string
): Promise<{ transactionId: string; newBalance: string }> {
  const target = await queryOne<{ id: string; currency: string }>(
    `SELECT id, currency FROM accounts WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
    [accountId, tenantId]
  );
  if (!target) throw new NotFoundError("Account");

  const currency = target.currency;

  // Get or create a per-currency reserve account for external funding
  let reserve = await queryOne<{ id: string }>(
    `SELECT id FROM accounts WHERE tenant_id = $1 AND type = 'reserve' AND name = 'External Funding' AND currency = $2 LIMIT 1`,
    [tenantId, currency]
  );
  if (!reserve) {
    reserve = await queryOne<{ id: string }>(
      `INSERT INTO accounts (tenant_id, name, type, currency, metadata)
       VALUES ($1, 'External Funding', 'reserve', $2, '{}')
       RETURNING id`,
      [tenantId, currency]
    );
  }
  if (!reserve) throw new Error("Failed to get/create reserve account");

  if (reserve.id === accountId) throw new ValidationError("Cannot deposit to reserve account");

  const reserveId = reserve.id;
  const depositAmount = parseFloat(amount);
  if (isNaN(depositAmount) || depositAmount <= 0) throw new ValidationError("Invalid deposit amount");

  return withTransaction(async (client) => {
    const targetBalRes = await client.query<{ balance: string }>(
      `SELECT COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE -amount END),0)::TEXT AS balance
       FROM ledger_entries WHERE account_id = $1`,
      [accountId]
    );
    const targetBalance = parseFloat(targetBalRes.rows[0]?.balance ?? "0");

    const reserveBalRes = await client.query<{ balance: string }>(
      `SELECT COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE -amount END),0)::TEXT AS balance
       FROM ledger_entries WHERE account_id = $1`,
      [reserveId]
    );
    const reserveBalance = parseFloat(reserveBalRes.rows[0]?.balance ?? "0");

    const idempotencyKey = `deposit-${accountId}-${Date.now()}`;
    const txRes = await client.query<{ id: string }>(
      `INSERT INTO transactions
         (tenant_id, source_account_id, destination_account_id, amount, currency, status, idempotency_key, description, metadata, processed_at)
       VALUES ($1,$2,$3,$4,$5,'completed',$6,$7,'{}',NOW())
       RETURNING id`,
      [tenantId, reserveId, accountId, amount, currency, idempotencyKey, description ?? "External deposit"]
    );
    const txId = txRes.rows[0]?.id;
    if (!txId) throw new Error("Failed to create deposit transaction");

    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, type, amount, balance_before, balance_after)
       VALUES
         ($1,$2,'debit',$3,$4,$5),
         ($1,$6,'credit',$3,$7,$8)`,
      [
        txId, reserveId, amount,
        reserveBalance.toFixed(8), (reserveBalance - depositAmount).toFixed(8),
        accountId,
        targetBalance.toFixed(8), (targetBalance + depositAmount).toFixed(8),
      ]
    );

    return { transactionId: txId, newBalance: (targetBalance + depositAmount).toFixed(2) };
  });
}

export async function getAccountWithBalance(
  id: string,
  tenantId: string
): Promise<AccountWithBalanceRow & { balance: string }> {
  const row = await queryOne<AccountWithBalanceRow>(
    `SELECT a.*,
       COALESCE(
         SUM(CASE WHEN le.type = 'credit' THEN le.amount ELSE -le.amount END),
         0
       )::TEXT AS balance
     FROM accounts a
     LEFT JOIN ledger_entries le ON le.account_id = a.id
     WHERE a.id = $1 AND a.tenant_id = $2
     GROUP BY a.id`,
    [id, tenantId]
  );
  if (!row) throw new NotFoundError("Account");
  return row;
}
