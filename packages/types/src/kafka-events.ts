import type { Transaction, FraudAlert, FraudRuleTriggered } from "./financial";

export interface KafkaEventBase {
  eventId: string;
  eventType: string;
  tenantId: string;
  timestamp: string;
  version: "1.0";
}

export interface TransactionCreatedEvent extends KafkaEventBase {
  eventType: "transaction.created";
  payload: {
    transaction: Transaction;
  };
}

export interface TransactionCompletedEvent extends KafkaEventBase {
  eventType: "transaction.completed";
  payload: {
    transaction: Transaction;
    sourceBalanceAfter: string;
    destinationBalanceAfter: string;
  };
}

export interface TransactionFailedEvent extends KafkaEventBase {
  eventType: "transaction.failed";
  payload: {
    transaction: Transaction;
    reason: string;
  };
}

export interface FraudAlertEvent extends KafkaEventBase {
  eventType: "fraud.alert";
  payload: {
    alert: FraudAlert;
    transaction: Transaction;
    rulesTriggered: FraudRuleTriggered[];
  };
}

export interface NotificationEmailEvent extends KafkaEventBase {
  eventType: "notification.email";
  payload: {
    to: string;
    subject: string;
    templateId: string;
    templateData: Record<string, unknown>;
  };
}

export interface NotificationWebhookEvent extends KafkaEventBase {
  eventType: "notification.webhook";
  payload: {
    webhookEndpointId: string;
    event: string;
    data: Record<string, unknown>;
  };
}

export type KafkaEvent =
  | TransactionCreatedEvent
  | TransactionCompletedEvent
  | TransactionFailedEvent
  | FraudAlertEvent
  | NotificationEmailEvent
  | NotificationWebhookEvent;

export const KAFKA_TOPICS = {
  TRANSACTIONS_CREATED: "transactions.created",
  TRANSACTIONS_COMPLETED: "transactions.completed",
  TRANSACTIONS_FAILED: "transactions.failed",
  FRAUD_ALERTS: "fraud.alerts",
  NOTIFICATIONS_EMAIL: "notifications.email",
  NOTIFICATIONS_WEBHOOK: "notifications.webhook",
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
