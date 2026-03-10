import { Kafka, Producer, ProducerRecord, CompressionTypes, SASLOptions } from "kafkajs";
import type { KafkaEvent, KafkaTopic } from "@finflow/types";
import crypto from "crypto";

let producer: Producer | null = null;
let kafka: Kafka | null = null;

function buildSaslConfig(): SASLOptions | undefined {
  const username = process.env["KAFKA_SASL_USERNAME"];
  const password = process.env["KAFKA_SASL_PASSWORD"];
  if (username && password) {
    return { mechanism: "scram-sha-256", username, password };
  }
  return undefined;
}

export function createKafkaProducer(brokers: string[], clientId: string): Kafka {
  const sasl = buildSaslConfig();
  kafka = new Kafka({
    clientId,
    brokers,
    ...(sasl ? { ssl: true, sasl } : {}),
    retry: {
      initialRetryTime: 100,
      retries: 8,
    },
  });
  return kafka;
}

export async function getProducer(): Promise<Producer> {
  if (!kafka) {
    throw new Error("Kafka not initialized. Call createKafkaProducer() first.");
  }
  if (!producer) {
    producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30_000,
    });
    await producer.connect();
    console.log("[kafka] Producer connected");
  }
  return producer;
}

export async function publishEvent<T extends KafkaEvent>(
  topic: KafkaTopic,
  event: Omit<T, "eventId" | "timestamp" | "version">
): Promise<void> {
  const fullEvent: T = {
    ...event,
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    version: "1.0",
  } as T;

  const record: ProducerRecord = {
    topic,
    compression: CompressionTypes.GZIP,
    messages: [
      {
        key: fullEvent.eventId,
        value: JSON.stringify(fullEvent),
        headers: {
          "event-type": fullEvent.eventType,
          "tenant-id": fullEvent.tenantId,
          "content-type": "application/json",
        },
      },
    ],
  };

  const prod = await getProducer();
  await prod.send(record);
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
}
