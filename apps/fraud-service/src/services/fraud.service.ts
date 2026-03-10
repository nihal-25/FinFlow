import { query, queryOne } from "@finflow/database";
import { publishEvent } from "@finflow/kafka";
import { KAFKA_TOPICS } from "@finflow/types";
import type { Transaction, FraudRuleTriggered } from "@finflow/types";
import { velocityCheck } from "../rules/velocity.rule";
import { amountAnomalyCheck } from "../rules/amount-anomaly.rule";
import { largeTransactionCheck } from "../rules/large-transaction.rule";
import { roundTripCheck } from "../rules/round-trip.rule";

export async function analyzeTransaction(transaction: Transaction): Promise<void> {
  const rulesTriggered: FraudRuleTriggered[] = [];

  // Run all rules in parallel
  const [velocityTriggered, anomalyTriggered, roundTripTriggered] = await Promise.all([
    velocityCheck(transaction.sourceAccountId),
    amountAnomalyCheck(transaction.sourceAccountId, transaction.amount),
    roundTripCheck(transaction.sourceAccountId, transaction.destinationAccountId, transaction.amount),
  ]);

  if (velocityTriggered) rulesTriggered.push("velocity_check");
  if (anomalyTriggered) rulesTriggered.push("amount_anomaly");
  if (largeTransactionCheck(transaction.amount)) rulesTriggered.push("large_transaction");
  if (roundTripTriggered) rulesTriggered.push("round_tripping");

  if (rulesTriggered.length === 0) {
    console.log(`[fraud] Transaction ${transaction.id} passed all checks`);
    return;
  }

  console.warn(`[fraud] Transaction ${transaction.id} flagged: ${rulesTriggered.join(", ")}`);

  // Risk score: 25 points per rule triggered, max 100
  const riskScore = Math.min(rulesTriggered.length * 25, 100);

  // Insert fraud alert
  interface AlertRow { id: string; tenant_id: string; transaction_id: string; account_id: string; rules_triggered: string[]; risk_score: number; status: string; metadata: Record<string, unknown>; resolved_at: Date | null; created_at: Date; }
  const alert = await queryOne<AlertRow>(
    `INSERT INTO fraud_alerts
       (tenant_id, transaction_id, account_id, rules_triggered, risk_score, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      transaction.tenantId,
      transaction.id,
      transaction.sourceAccountId,
      rulesTriggered,
      riskScore,
      JSON.stringify({ amount: transaction.amount, currency: transaction.currency }),
    ]
  );

  if (!alert) return;

  // Update transaction status to flagged
  await query(
    `UPDATE transactions SET status = 'flagged', updated_at = NOW() WHERE id = $1`,
    [transaction.id]
  );

  // Write audit log
  await query(
    `INSERT INTO audit_logs (tenant_id, action, resource, resource_id, request_id, metadata)
     VALUES ($1, 'fraud.detected', 'transaction', $2, $3, $4)`,
    [
      transaction.tenantId,
      transaction.id,
      `fraud-service-${transaction.id}`,
      JSON.stringify({ rulesTriggered, riskScore }),
    ]
  );

  // Publish fraud alert event
  await publishEvent(KAFKA_TOPICS.FRAUD_ALERTS, {
    eventType: "fraud.alert",
    tenantId: transaction.tenantId,
    payload: {
      alert: {
        id: alert.id,
        tenantId: alert.tenant_id,
        transactionId: alert.transaction_id,
        accountId: alert.account_id,
        rulesTriggered: alert.rules_triggered as FraudRuleTriggered[],
        riskScore: alert.risk_score,
        status: alert.status as "open",
        metadata: alert.metadata,
        resolvedAt: alert.resolved_at,
        createdAt: alert.created_at,
      },
      transaction,
      rulesTriggered,
    },
  });
}
