import "./patches"; // must be first — patches @finflow/* module resolution
import "dotenv/config";
import { createPool } from "@finflow/database";
import { createRedisClient } from "@finflow/redis";
import { config } from "./config";
import { logger } from "./utils/logger";
import app from "./app";

async function bootstrap(): Promise<void> {
  logger.info("Starting FinFlow API Gateway...");

  // Connect to PostgreSQL
  createPool(config.DATABASE_URL);
  logger.info("PostgreSQL pool initialized");

  // Connect to Redis
  createRedisClient(config.REDIS_URL);
  logger.info("Redis client initialized");

  const server = app.listen(config.PORT, () => {
    logger.info(`API Gateway listening on port ${config.PORT}`, {
      port: config.PORT,
      env: config.NODE_ENV,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      const { closePool } = await import("@finflow/database");
      const { closeRedisClient } = await import("@finflow/redis");
      await Promise.all([closePool(), closeRedisClient()]);
      logger.info("Shutdown complete");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", { reason: String(reason) });
  });
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
