import { Kafka, Consumer, EachMessagePayload, SASLOptions } from "kafkajs";
import type { KafkaEvent, KafkaTopic } from "@finflow/types";

interface ConsumerOptions {
  groupId: string;
  topics: KafkaTopic[];
  fromBeginning?: boolean;
  maxRetries?: number;
}

type MessageHandler<T extends KafkaEvent = KafkaEvent> = (
  event: T,
  rawPayload: EachMessagePayload
) => Promise<void>;

export async function createConsumer(
  kafka: Kafka,
  options: ConsumerOptions,
  handler: MessageHandler
): Promise<Consumer> {
  const consumer = kafka.consumer({
    groupId: options.groupId,
    maxWaitTimeInMs: 50,
    sessionTimeout: 30_000,
    heartbeatInterval: 3_000,
    retry: {
      initialRetryTime: 100,
      retries: options.maxRetries ?? 5,
    },
  });

  await consumer.connect();
  console.log(`[kafka] Consumer connected: groupId=${options.groupId}`);

  await consumer.subscribe({
    topics: options.topics,
    fromBeginning: options.fromBeginning ?? false,
  });

  await consumer.run({
    autoCommit: false,
    eachMessage: async (payload) => {
      const { topic, partition, message } = payload;
      const rawValue = message.value?.toString();

      if (!rawValue) {
        console.warn(`[kafka] Empty message on topic ${topic}`);
        await consumer.commitOffsets([
          { topic, partition, offset: (Number(message.offset) + 1).toString() },
        ]);
        return;
      }

      let event: KafkaEvent;
      try {
        event = JSON.parse(rawValue) as KafkaEvent;
      } catch (err) {
        console.error(`[kafka] Failed to parse message on topic ${topic}:`, err);
        await consumer.commitOffsets([
          { topic, partition, offset: (Number(message.offset) + 1).toString() },
        ]);
        return;
      }

      let lastError: unknown;
      const maxRetries = options.maxRetries ?? 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await handler(event, payload);
          await consumer.commitOffsets([
            { topic, partition, offset: (Number(message.offset) + 1).toString() },
          ]);
          return;
        } catch (err) {
          lastError = err;
          console.error(
            `[kafka] Handler failed (attempt ${attempt}/${maxRetries}) for event ${event.eventId}:`,
            err
          );
          if (attempt < maxRetries) {
            await sleep(Math.pow(2, attempt) * 100);
          }
        }
      }

      console.error(
        `[kafka] Message permanently failed after ${maxRetries} attempts. EventId: ${(event as KafkaEvent).eventId}`,
        lastError
      );
      // Still commit to avoid infinite loop — consider DLQ for production
      await consumer.commitOffsets([
        { topic, partition, offset: (Number(message.offset) + 1).toString() },
      ]);
    },
  });

  return consumer;
}

function buildSaslConfig(): SASLOptions | undefined {
  const username = process.env["KAFKA_SASL_USERNAME"];
  const password = process.env["KAFKA_SASL_PASSWORD"];
  if (username && password) {
    return { mechanism: "scram-sha-256", username, password };
  }
  return undefined;
}

export function getKafkaInstance(brokers: string[], clientId: string): Kafka {
  const sasl = buildSaslConfig();
  return new Kafka({
    clientId,
    brokers,
    ...(sasl ? { ssl: true, sasl } : {}),
    retry: { initialRetryTime: 100, retries: 8 },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
