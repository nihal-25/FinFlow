import { Router, Request, Response } from "express";
import { healthCheck } from "@finflow/database";
import { redisHealthCheck } from "@finflow/redis";
import { sendSuccess } from "../utils/response";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      name: "FinFlow API",
      description: "Production-grade financial transaction platform",
      version: "1.0.0",
      status: "operational",
      dashboard: "https://frontend-phi-six-93.vercel.app",
      endpoints: {
        health:       "GET  /health",
        register:     "POST /auth/register",
        login:        "POST /auth/login",
        accounts:     "GET  /accounts          (JWT required)",
        transactions: "GET  /transactions      (JWT required)",
        fraudAlerts:  "GET  /fraud-alerts      (JWT required)",
        analytics:    "GET  /analytics/summary (JWT required)",
        webhooks:     "GET  /webhooks          (JWT required)",
      },
      docs: "https://github.com/nihal-25/FinFlow#api-reference",
    },
  });
});

router.get("/health", async (_req: Request, res: Response): Promise<void> => {
  const [dbOk, redisOk] = await Promise.all([healthCheck(), redisHealthCheck()]);

  const status = dbOk && redisOk ? "healthy" : "degraded";
  const code = status === "healthy" ? 200 : 503;

  res.status(code).json({
    success: status === "healthy",
    data: {
      status,
      service: "api-gateway",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? "ok" : "error",
        redis: redisOk ? "ok" : "error",
      },
    },
  });
});

export default router;
