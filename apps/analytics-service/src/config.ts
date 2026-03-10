import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3005),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string(),
  KAFKA_BROKERS: z.string().default("localhost:9092"),
  KAFKA_CLIENT_ID: z.string().default("analytics-service"),
  KAFKA_SASL_USERNAME: z.string().optional(),
  KAFKA_SASL_PASSWORD: z.string().optional(),
  KAFKA_GROUP_ID: z.string().default("analytics-service-group"),
  JWT_ACCESS_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) { console.error("[config] Invalid env:", result.error.flatten().fieldErrors); process.exit(1); }
  return result.data;
}
export const config = loadConfig();
