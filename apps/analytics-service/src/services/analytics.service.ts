import { getRedisClient } from "@finflow/redis";
import { query, queryOne } from "@finflow/database";

const STATS_PREFIX = "finflow:analytics:";

export async function updateTenantStats(
  tenantId: string,
  amount: string,
  status: "completed" | "failed"
): Promise<void> {
  const redis = getRedisClient();
  const pipeline = redis.pipeline();
  const amountFloat = parseFloat(amount);

  // Total volume
  pipeline.incrbyfloat(`${STATS_PREFIX}${tenantId}:volume`, amountFloat);
  // Transaction count
  pipeline.incr(`${STATS_PREFIX}${tenantId}:count`);
  // Failed count
  if (status === "failed") {
    pipeline.incr(`${STATS_PREFIX}${tenantId}:failed_count`);
  }

  // Hourly bucket (for time series charts)
  const hourBucket = new Date().toISOString().slice(0, 13); // "2024-01-15T14"
  pipeline.incrbyfloat(`${STATS_PREFIX}${tenantId}:hourly:${hourBucket}`, amountFloat);
  pipeline.expire(`${STATS_PREFIX}${tenantId}:hourly:${hourBucket}`, 7 * 24 * 3600); // 7 days

  await pipeline.exec();
}

export async function getTenantSummary(tenantId: string): Promise<{
  totalVolume: string;
  transactionCount: number;
  failedCount: number;
  successRate: number;
  fraudAlertCount: number;
}> {
  const [result, fraudResult] = await Promise.all([
    queryOne<{ total_volume: string; transaction_count: string; failed_count: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0)::TEXT AS total_volume,
         COUNT(*)::TEXT AS transaction_count,
         COUNT(CASE WHEN status IN ('failed', 'flagged') THEN 1 END)::TEXT AS failed_count
       FROM transactions
       WHERE tenant_id = $1`,
      [tenantId]
    ),
    queryOne<{ alert_count: string }>(
      `SELECT COUNT(*)::TEXT AS alert_count FROM fraud_alerts WHERE tenant_id = $1 AND status NOT IN ('resolved', 'dismissed')`,
      [tenantId]
    ),
  ]);

  const totalCount = parseInt(result?.transaction_count ?? "0", 10);
  const failedCount = parseInt(result?.failed_count ?? "0", 10);
  const successRate = totalCount > 0 ? ((totalCount - failedCount) / totalCount) * 100 : 100;

  return {
    totalVolume: result?.total_volume ?? "0",
    transactionCount: totalCount,
    failedCount,
    successRate: Math.round(successRate * 100) / 100,
    fraudAlertCount: parseInt(fraudResult?.alert_count ?? "0", 10),
  };
}

export async function getVolumeTimeSeries(
  tenantId: string,
  period: "7d" | "30d" | "24h"
): Promise<Array<{ date: string; volume: string; count: number }>> {
  const intervals: Record<string, string> = {
    "24h": "1 hour",
    "7d": "1 day",
    "30d": "1 day",
  };
  const ranges: Record<string, string> = {
    "24h": "24 hours",
    "7d": "7 days",
    "30d": "30 days",
  };

  const interval = intervals[period] ?? "1 day";
  const range = ranges[period] ?? "7 days";

  const rows = await query<{ bucket: Date; volume: string; count: string }>(
    `SELECT
       date_trunc($1, t.created_at) AS bucket,
       SUM(CASE WHEN le.type = 'debit' THEN le.amount ELSE 0 END)::TEXT AS volume,
       COUNT(DISTINCT t.id)::TEXT AS count
     FROM transactions t
     JOIN ledger_entries le ON le.transaction_id = t.id
     WHERE t.tenant_id = $2
       AND t.status = 'completed'
       AND t.created_at > NOW() - INTERVAL '1 second' * $3
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [interval.split(" ")[1], tenantId, range === "24 hours" ? 86400 : range === "7 days" ? 604800 : 2592000]
  );

  return rows.map((r) => ({
    date: r.bucket.toISOString(),
    volume: r.volume ?? "0",
    count: parseInt(r.count ?? "0", 10),
  }));
}

export async function getFraudRate(tenantId: string): Promise<{
  total: number;
  flagged: number;
  fraudRate: number;
}> {
  const result = await queryOne<{ total: string; flagged: string }>(
    `SELECT
       COUNT(*)::TEXT AS total,
       COUNT(CASE WHEN status IN ('flagged') THEN 1 END)::TEXT AS flagged
     FROM transactions
     WHERE tenant_id = $1
       AND created_at > NOW() - INTERVAL '30 days'`,
    [tenantId]
  );

  const total = parseInt(result?.total ?? "0", 10);
  const flagged = parseInt(result?.flagged ?? "0", 10);
  const fraudRate = total > 0 ? (flagged / total) * 100 : 0;

  return { total, flagged, fraudRate: Math.round(fraudRate * 100) / 100 };
}
