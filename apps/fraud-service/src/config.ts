import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string(),
  KAFKA_BROKERS: z.string().default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().default("fraud-service"),
  KAFKA_SASL_USERNAME: z.string().optional(),
  KAFKA_SASL_PASSWORD: z.string().optional(),
  KAFKA_GROUP_ID: z.string().default("fraud-service-group"),
  VELOCITY_WINDOW_SECONDS: z.coerce.number().default(300),
  VELOCITY_MAX_TRANSACTIONS: z.coerce.number().default(10),
  LARGE_TRANSACTION_THRESHOLD: z.coerce.number().default(10_000),
  ANOMALY_MULTIPLIER: z.coerce.number().default(5),
  ROUND_TRIP_WINDOW_SECONDS: z.coerce.number().default(60),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("[config] Invalid env:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
