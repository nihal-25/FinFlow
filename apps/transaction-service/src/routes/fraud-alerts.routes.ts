import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { query, queryOne } from "@finflow/database";
import { sendSuccess } from "../utils/response";
import { NotFoundError, ValidationError } from "../utils/errors";

const router = Router();

interface FraudAlertRow {
  id: string;
  tenant_id: string;
  transaction_id: string;
  account_id: string;
  rules_triggered: string[];
  risk_score: number;
  status: string;
  metadata: Record<string, unknown>;
  resolved_at: Date | null;
  created_at: Date;
}

router.get(
  "/",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const alerts = await query<FraudAlertRow>(
        `SELECT * FROM fraud_alerts WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [req.tenantId!]
      );
      sendSuccess(res, alerts);
    } catch (err) { next(err); }
  }
);

router.get(
  "/:id",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const alert = await queryOne<FraudAlertRow>(
        `SELECT * FROM fraud_alerts WHERE id = $1 AND tenant_id = $2`,
        [req.params["id"]!, req.tenantId!]
      );
      if (!alert) throw new NotFoundError("Fraud alert");
      sendSuccess(res, alert);
    } catch (err) { next(err); }
  }
);

const updateStatusSchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "dismissed"]),
});

router.patch(
  "/:id/status",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = updateStatusSchema.safeParse(req.body);
      if (!body.success) throw new ValidationError("Invalid status", body.error.flatten());

      const resolvedAt = ["resolved", "dismissed"].includes(body.data.status) ? "NOW()" : "NULL";
      const alert = await queryOne<FraudAlertRow>(
        `UPDATE fraud_alerts
         SET status = $1, resolved_at = ${resolvedAt}
         WHERE id = $2 AND tenant_id = $3
         RETURNING *`,
        [body.data.status, req.params["id"]!, req.tenantId!]
      );
      if (!alert) throw new NotFoundError("Fraud alert");
      sendSuccess(res, alert);
    } catch (err) { next(err); }
  }
);

export default router;
