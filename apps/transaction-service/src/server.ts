import "./patches"; // must be first — patches @finflow/* module resolution
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import { createPool } from "@finflow/database";
import { createRedisClient } from "@finflow/redis";
import { createKafkaProducer } from "@finflow/kafka";
import { config } from "./config";
import accountRoutes from "./routes/accounts.routes";
import transactionRoutes from "./routes/transactions.routes";
import fraudAlertsRoutes from "./routes/fraud-alerts.routes";
import webhooksRoutes from "./routes/webhooks.routes";
import demoRoutes from "./routes/demo.routes";

const app = express();

app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use((req, _res, next) => { (req as express.Request & { requestId: string }).requestId = uuidv4(); next(); });
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
if (config.NODE_ENV !== "test") app.use(morgan("combined"));

app.use("/accounts", accountRoutes);
app.use("/transactions", transactionRoutes);
app.use("/fraud-alerts", fraudAlertsRoutes);
app.use("/webhooks", webhooksRoutes);
app.use("/demo", demoRoutes);

app.get("/health", (_req, res) => res.json({ success: true, data: { status: "healthy", service: "transaction-service" } }));

// Error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && typeof err === "object" && "statusCode" in err) {
    const e = err as { statusCode: number; code: string; message: string };
    res.status(e.statusCode).json({ success: false, error: { code: e.code, message: e.message } });
    return;
  }
  console.error("[transaction-service] Unhandled error:", err);
  res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "An internal error occurred" } });
});

async function bootstrap(): Promise<void> {
  createPool(config.DATABASE_URL);
  createRedisClient(config.REDIS_URL);
  createKafkaProducer(config.KAFKA_BROKERS.split(","), config.KAFKA_CLIENT_ID);

  app.listen(config.PORT, () => {
    console.log(JSON.stringify({ level: "INFO", service: "transaction-service", message: `Listening on port ${config.PORT}` }));
  });
}

process.on("uncaughtException", (err) => { console.error("[transaction-service] Uncaught exception:", err.message); });
process.on("unhandledRejection", (reason) => { console.error("[transaction-service] Unhandled rejection:", reason); });

bootstrap().catch((err) => { console.error("Bootstrap failed:", err); process.exit(1); });
