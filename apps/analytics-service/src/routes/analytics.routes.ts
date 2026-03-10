import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { getTenantSummary, getVolumeTimeSeries, getFraudRate } from "../services/analytics.service";
import type { JwtPayload, Role } from "@finflow/types";

const router = Router();

// Simple inline auth for analytics service
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) { res.status(401).json({ success: false, error: { code: "AUTH_REQUIRED", message: "Bearer token required" } }); return; }
  try {
    const payload = jwt.verify(auth.slice(7), config.JWT_ACCESS_SECRET) as JwtPayload;
    (req as Request & { tenantId: string; userRole: Role }).tenantId = payload.tenantId;
    (req as Request & { tenantId: string; userRole: Role }).userRole = payload.role as Role;
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: "INVALID_TOKEN", message: "Invalid token" } });
  }
}

router.get("/summary", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as Request & { tenantId: string }).tenantId;
    const summary = await getTenantSummary(tenantId);
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

router.get("/volume", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as Request & { tenantId: string }).tenantId;
    const period = (req.query["period"] as "7d" | "30d" | "24h" | undefined) ?? "7d";
    const data = await getVolumeTimeSeries(tenantId, period);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get("/fraud-rate", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as Request & { tenantId: string }).tenantId;
    const data = await getFraudRate(tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
