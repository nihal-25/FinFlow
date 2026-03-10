import "./patches"; // must be first — patches @finflow/* module resolution
import "dotenv/config";
import { createPool } from "@finflow/database";
import { createRedisClient } from "@finflow/redis";
import { createKafkaProducer } from "@finflow/kafka";
import { config } from "./config";
import { startTransactionConsumer } from "./consumers/transaction.consumer";

async function startConsumerWithRetry(attempt = 0): Promise<void> {
  try {
    await startTransactionConsumer();
    console.log("[fraud-service] Kafka consumer ready");
  } catch (err) {
    const delay = Math.min(Math.pow(2, attempt) * 1000, 30_000);
    console.error(`[fraud-service] Kafka consumer failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, err);
    setTimeout(() => startConsumerWithRetry(attempt + 1), delay);
  }
}

async function bootstrap(): Promise<void> {
  console.log("[fraud-service] Starting...");

  createPool(config.DATABASE_URL);
  createRedisClient(config.REDIS_URL);
  createKafkaProducer(config.KAFKA_BROKERS.split(","), config.KAFKA_CLIENT_ID);

  // Start consumer in background — service stays up even if Kafka is temporarily unavailable
  startConsumerWithRetry();

  console.log("[fraud-service] Ready");

  process.on("SIGTERM", async () => {
    console.log("[fraud-service] Shutting down...");
    const { closePool } = await import("@finflow/database");
    const { closeRedisClient } = await import("@finflow/redis");
    await Promise.all([closePool(), closeRedisClient()]);
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error("[fraud-service] Bootstrap failed:", err);
  process.exit(1);
});
