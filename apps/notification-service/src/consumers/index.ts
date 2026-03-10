import { getKafkaInstance, createConsumer } from "@finflow/kafka";
import { KAFKA_TOPICS } from "@finflow/types";
import type { FraudAlertEvent, NotificationEmailEvent, NotificationWebhookEvent } from "@finflow/types";
import { sendEmail, buildFraudAlertEmail } from "../services/email.service";
import { deliverWebhook } from "../services/webhook.service";
import { queryOne } from "@finflow/database";
import { config } from "../config";

export async function startConsumers(): Promise<void> {
  const kafka = getKafkaInstance(config.KAFKA_BROKERS.split(","), config.KAFKA_CLIENT_ID);

  // ─── Fraud Alert Consumer ─────────────────────────────────────────────────
  await createConsumer(
    kafka,
    { groupId: `${config.KAFKA_GROUP_ID}-fraud`, topics: [KAFKA_TOPICS.FRAUD_ALERTS] },
    async (event) => {
      if (event.eventType !== "fraud.alert") return;

      const fraudEvent = event as FraudAlertEvent;
      const { alert, transaction } = fraudEvent.payload;

      // Look up tenant admin email
      interface AdminRow { email: string; first_name: string; }
      const admin = await queryOne<AdminRow>(
        `SELECT u.email, u.first_name FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         WHERE t.id = $1 AND u.role = 'admin' AND u.is_active = TRUE
         LIMIT 1`,
        [alert.tenantId]
      );

      if (admin) {
        const { subject, html } = buildFraudAlertEmail({
          tenantName: admin.first_name,
          transactionId: transaction.id,
          amount: transaction.amount,
          currency: transaction.currency,
          rulesTriggered: alert.rulesTriggered,
          riskScore: alert.riskScore,
        });
        await sendEmail({ to: admin.email, subject, html });
      }

      // Deliver to all active webhook endpoints subscribed to fraud alerts
      interface WebhookRow { id: string; }
      const webhookEndpoints = await queryOne<WebhookRow>(
        `SELECT id FROM webhook_endpoints
         WHERE tenant_id = $1 AND is_active = TRUE AND 'fraud.alert' = ANY(events)`,
        [alert.tenantId]
      );

      if (webhookEndpoints) {
        await deliverWebhook(webhookEndpoints.id, "fraud.alert", {
          alert,
          transaction,
        });
      }
    }
  );

  // ─── Email Notification Consumer ──────────────────────────────────────────
  await createConsumer(
    kafka,
    { groupId: `${config.KAFKA_GROUP_ID}-email`, topics: [KAFKA_TOPICS.NOTIFICATIONS_EMAIL] },
    async (event) => {
      if (event.eventType !== "notification.email") return;
      const emailEvent = event as NotificationEmailEvent;
      await sendEmail({
        to: emailEvent.payload.to,
        subject: emailEvent.payload.subject,
        html: JSON.stringify(emailEvent.payload.templateData),
      });
    }
  );

  // ─── Webhook Notification Consumer ────────────────────────────────────────
  await createConsumer(
    kafka,
    { groupId: `${config.KAFKA_GROUP_ID}-webhook`, topics: [KAFKA_TOPICS.NOTIFICATIONS_WEBHOOK] },
    async (event) => {
      if (event.eventType !== "notification.webhook") return;
      const webhookEvent = event as NotificationWebhookEvent;
      await deliverWebhook(
        webhookEvent.payload.webhookEndpointId,
        webhookEvent.payload.event,
        webhookEvent.payload.data
      );
    }
  );

  console.log("[notification-service] All consumers started");
}
