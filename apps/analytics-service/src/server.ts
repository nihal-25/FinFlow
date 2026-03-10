import "./patches"; // must be first — patches @finflow/* module resolution
import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";
import { createPool } from "@finflow/database";
import { createRedisClient } from "@finflow/redis";
import { createKafkaProducer } from "@finflow/kafka";
import { config } from "./config";
import analyticsRoutes from "./routes/analytics.routes";
import { startTransactionConsumer, setSocketServer } from "./consumers/transaction.consumer";
import type { JwtPayload } from "@finflow/types";

const app = express();
const server = http.createServer(app);

// ─── WebSocket server ────────────────────────────────────────────────────────
const io = new SocketServer(server, {
  cors: { origin: config.CORS_ORIGIN, credentials: true },
});

io.use((socket, next) => {
  const token = socket.handshake.auth["token"] as string | undefined;
  if (!token) { next(new Error("Authentication required")); return; }
  try {
    const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
    socket.data["tenantId"] = payload.tenantId;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const tenantId = socket.data["tenantId"] as string;
  // Tenant isolation — join tenant-specific room
  socket.join(`tenant:${tenantId}`);
  console.log(`[ws] Client connected for tenant: ${tenantId}`);

  socket.on("disconnect", () => {
    console.log(`[ws] Client disconnected for tenant: ${tenantId}`);
  });
});

// ─── REST API ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.use("/analytics", analyticsRoutes);

// Internal endpoint called by transaction-service to emit Socket.io events
// Not exposed publicly — Railway internal networking only
app.post("/internal/transaction-event", (req, res) => {
  const { tenantId, event, data } = req.body as { tenantId?: string; event?: string; data?: unknown };
  if (tenantId && event) {
    io.to(`tenant:${tenantId}`).emit(event, data);
  }
  res.json({ success: true });
});

app.get("/health", (_req, res) => res.json({ success: true, data: { status: "healthy", service: "analytics-service" } }));
app.get("/", (_req, res) => res.json({
  success: true,
  data: {
    name: "FinFlow Analytics Service",
    description: "Real-time analytics aggregation and WebSocket event broadcasting",
    version: "1.0.0",
    status: "operational",
    endpoints: {
      health:        "GET /health",
      summary:       "GET /analytics/summary       (JWT required)",
      volume:        "GET /analytics/volume?period=7d (JWT required)",
      fraudRate:     "GET /analytics/fraud-rate    (JWT required)",
    },
    websocket: {
      url: "wss://analytics-service-production-7454.up.railway.app",
      auth: "{ auth: { token: '<jwt>' } }",
      events: ["transaction:completed", "transaction:failed"],
    },
  },
}));

// Error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const e = err as { statusCode?: number; code?: string; message?: string };
  res.status(e.statusCode ?? 500).json({ success: false, error: { code: e.code ?? "INTERNAL_ERROR", message: e.message ?? "Internal error" } });
});

async function startConsumerWithRetry(attempt = 0): Promise<void> {
  try {
    await startTransactionConsumer();
    console.log("[analytics-service] Kafka consumer ready");
  } catch (err) {
    const delay = Math.min(Math.pow(2, attempt) * 1000, 30_000);
    console.error(`[analytics-service] Kafka consumer failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, err);
    setTimeout(() => startConsumerWithRetry(attempt + 1), delay);
  }
}

async function bootstrap(): Promise<void> {
  createPool(config.DATABASE_URL);
  createRedisClient(config.REDIS_URL);
  createKafkaProducer(config.KAFKA_BROKERS.split(","), config.KAFKA_CLIENT_ID);
  setSocketServer(io);

  server.listen(config.PORT, () => {
    console.log(JSON.stringify({ level: "INFO", service: "analytics-service", message: `Listening on port ${config.PORT}` }));
  });

  // Start consumer in background — service stays up even if Kafka is temporarily unavailable
  startConsumerWithRetry();
}

bootstrap().catch((err) => { console.error("[analytics-service] Bootstrap failed:", err); process.exit(1); });
