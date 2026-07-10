import { Kafka, Producer, ProducerRecord, CompressionTypes, SASLOptions } from "kafkajs";
import type { KafkaEvent, KafkaTopic } from "@finflow/types";
import crypto from "crypto";

let producer: Producer | null = null;
let kafka: Kafka | null = null;
let connected = false;

function buildSaslConfig(): SASLOptions | undefined {
  const username = process.env["KAFKA_SASL_USERNAME"];
  const password = process.env["KAFKA_SASL_PASSWORD"];
  if (username && password) {
    return { mechanism: "plain", username, password };
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
    // Track connection state so we can transparently reconnect after the broker
    // (e.g. Confluent Cloud) drops an idle connection. Without this, the cached
    // producer stays permanently disconnected and every send() throws
    // "The producer is disconnected".
    producer.on(producer.events.DISCONNECT, () => {
      connected = false;
      console.warn("[kafka] Producer disconnected");
    });
    producer.on(producer.events.CONNECT, () => {
      connected = true;
    });
  }
  if (!connected) {
    await producer.connect();
    connected = true;
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

  // Send with one transparent reconnect + retry: if the cached producer was
  // disconnected by the broker between publishes, reconnect and resend once.
  try {
    const prod = await getProducer();
    await prod.send(record);
  } catch (err) {
    const message = (err as Error).message || "";
    if (/disconnect/i.test(message)) {
      connected = false;
      const prod = await getProducer();
      await prod.send(record);
    } else {
      throw err;
    }
  }
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    connected = false;
  }
}

/**
 * Eagerly establish the producer connection at service startup so the first
 * publish doesn't race against connection setup, and so a dead connection is
 * surfaced/reconnected proactively.
 */
export async function connectProducer(): Promise<void> {
  await getProducer();
}
