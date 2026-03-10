import "./patches"; // must be first — patches @finflow/* module resolution
import "dotenv/config";
import http from "http";
import { createPool } from "@finflow/database";
import { config } from "./config";
import { startConsumers } from "./consumers/index";

async function startConsumersWithRetry(attempt = 0): Promise<void> {
  try {
    await startConsumers();
    console.log("[notification-service] Kafka consumers ready");
  } catch (err) {
    const delay = Math.min(Math.pow(2, attempt) * 1000, 30_000);
    console.error(`[notification-service] Kafka failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, err);
    setTimeout(() => startConsumersWithRetry(attempt + 1), delay);
  }
}

async function bootstrap(): Promise<void> {
  console.log("[notification-service] Starting...");
  createPool(config.DATABASE_URL);

  // Minimal HTTP server for Railway health checks
  const port = process.env["PORT"] ? Number(process.env["PORT"]) : 3003;
  http.createServer((_req, res) => res.writeHead(200).end(JSON.stringify({ status: "healthy", service: "notification-service" }))).listen(port, () => {
    console.log(`[notification-service] Health server on port ${port}`);
  });

  startConsumersWithRetry();
  console.log("[notification-service] Ready");

  process.on("SIGTERM", async () => {
    const { closePool } = await import("@finflow/database");
    await closePool();
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error("[notification-service] Bootstrap failed:", err);
  process.exit(1);
});
