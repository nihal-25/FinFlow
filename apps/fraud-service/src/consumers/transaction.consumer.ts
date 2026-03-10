import { getKafkaInstance, createConsumer } from "@finflow/kafka";
import { KAFKA_TOPICS } from "@finflow/types";
import type { TransactionCompletedEvent } from "@finflow/types";
import { analyzeTransaction } from "../services/fraud.service";
import { config } from "../config";

export async function startTransactionConsumer(): Promise<void> {
  const kafka = getKafkaInstance(
    config.KAFKA_BROKERS.split(","),
    config.KAFKA_CLIENT_ID
  );

  await createConsumer(
    kafka,
    {
      groupId: config.KAFKA_GROUP_ID,
      topics: [KAFKA_TOPICS.TRANSACTIONS_COMPLETED],
      fromBeginning: false,
      maxRetries: 3,
    },
    async (event) => {
      if (event.eventType !== "transaction.completed") return;

      const completedEvent = event as TransactionCompletedEvent;
      await analyzeTransaction(completedEvent.payload.transaction);
    }
  );

  console.log("[fraud-service] Transaction consumer started");
}
