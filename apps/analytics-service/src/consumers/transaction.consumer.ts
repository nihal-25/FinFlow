import { getKafkaInstance, createConsumer } from "@finflow/kafka";
import { KAFKA_TOPICS } from "@finflow/types";
import type { TransactionCompletedEvent, TransactionFailedEvent, FraudAlertEvent } from "@finflow/types";
import { updateTenantStats } from "../services/analytics.service";
import { config } from "../config";
import type { Server as SocketServer } from "socket.io";

let io: SocketServer | null = null;

export function setSocketServer(socketServer: SocketServer): void {
  io = socketServer;
}

export async function startTransactionConsumer(): Promise<void> {
  const kafka = getKafkaInstance(config.KAFKA_BROKERS.split(","), config.KAFKA_CLIENT_ID);

  await createConsumer(
    kafka,
    {
      groupId: config.KAFKA_GROUP_ID,
      topics: [KAFKA_TOPICS.TRANSACTIONS_COMPLETED, KAFKA_TOPICS.TRANSACTIONS_FAILED, KAFKA_TOPICS.FRAUD_ALERTS],
    },
    async (event) => {
      if (event.eventType === "transaction.completed") {
        const e = event as TransactionCompletedEvent;
        await updateTenantStats(e.tenantId, e.payload.transaction.amount, "completed");

        // Push real-time update to WebSocket clients in tenant room
        if (io) {
          io.to(`tenant:${e.tenantId}`).emit("transaction:completed", {
            transaction: e.payload.transaction,
            timestamp: e.timestamp,
          });
        }
      } else if (event.eventType === "transaction.failed") {
        const e = event as TransactionFailedEvent;
        await updateTenantStats(e.tenantId, e.payload.transaction.amount, "failed");

        if (io) {
          io.to(`tenant:${e.tenantId}`).emit("transaction:failed", {
            transaction: e.payload.transaction,
            reason: e.payload.reason,
            timestamp: e.timestamp,
          });
        }
      } else if (event.eventType === "fraud.alert") {
        // A fraud alert was just written. Push it so the dashboard invalidates
        // its cached analytics summary and recomputes the fraud count immediately
        // (event-driven invalidation on write, not on read).
        const e = event as FraudAlertEvent;
        if (io) {
          io.to(`tenant:${e.tenantId}`).emit("fraud:alert", {
            alert: e.payload.alert,
            transaction: e.payload.transaction,
            timestamp: e.timestamp,
          });
        }
      }
    }
  );

  console.log("[analytics-service] Transaction consumer started");
}
