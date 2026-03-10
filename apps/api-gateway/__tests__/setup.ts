import { createPool } from "@finflow/database";
import { createRedisClient } from "@finflow/redis";

export default async function globalSetup(): Promise<void> {
  process.env["NODE_ENV"] = "test";
  process.env["DATABASE_URL"] = "postgresql://finflow:finflow_secret@localhost:5432/finflow_test";
  process.env["REDIS_URL"] = "redis://:finflow_redis_secret@localhost:6379";
  process.env["JWT_ACCESS_SECRET"] = "test-jwt-access-secret-at-least-32-chars-long!!";
  process.env["JWT_REFRESH_SECRET"] = "test-jwt-refresh-secret-at-least-32-chars-long!";
  process.env["JWT_ACCESS_EXPIRES_IN"] = "15m";
  process.env["JWT_REFRESH_EXPIRES_IN"] = "7d";
  process.env["PORT"] = "0";

  createPool(process.env["DATABASE_URL"]!);
  createRedisClient(process.env["REDIS_URL"]!);
}
