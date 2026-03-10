import { queryOne } from "@finflow/database";
import { config } from "../config";

/**
 * Round-Tripping: flag if money was sent and returned between same accounts within W seconds.
 */
export async function roundTripCheck(
  sourceAccountId: string,
  destinationAccountId: string,
  amount: string
): Promise<boolean> {
  const result = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count
     FROM transactions
     WHERE source_account_id = $1
       AND destination_account_id = $2
       AND amount = $3
       AND status = 'completed'
       AND created_at > NOW() - INTERVAL '1 second' * $4`,
    [destinationAccountId, sourceAccountId, amount, config.ROUND_TRIP_WINDOW_SECONDS]
  );

  return parseInt(result?.count ?? "0", 10) > 0;
}
