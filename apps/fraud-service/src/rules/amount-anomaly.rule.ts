import { queryOne } from "@finflow/database";
import { config } from "../config";

/**
 * Amount Anomaly: flag if transaction is > N× the account's 30-day average.
 */
export async function amountAnomalyCheck(
  accountId: string,
  amount: string
): Promise<boolean> {
  const result = await queryOne<{ avg_amount: string; tx_count: string }>(
    `SELECT
       AVG(le.amount)::TEXT AS avg_amount,
       COUNT(*)::TEXT AS tx_count
     FROM ledger_entries le
     JOIN transactions t ON t.id = le.transaction_id
     WHERE le.account_id = $1
       AND le.type = 'debit'
       AND le.created_at > NOW() - INTERVAL '30 days'`,
    [accountId]
  );

  const count = parseInt(result?.tx_count ?? "0", 10);
  if (count < 5) return false; // Not enough history

  const avg = parseFloat(result?.avg_amount ?? "0");
  const txAmount = parseFloat(amount);
  if (avg === 0) return false;

  return txAmount > avg * config.ANOMALY_MULTIPLIER;
}
