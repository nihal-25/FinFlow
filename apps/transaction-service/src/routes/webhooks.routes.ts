import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { query, queryOne } from "@finflow/database";
import { sendSuccess } from "../utils/response";
import { NotFoundError, ValidationError } from "../utils/errors";
import crypto from "crypto";
import https from "https";
import http from "http";

const router = Router();

interface WebhookRow {
  id: string;
  tenant_id: string;
  url: string;
  events: string[];
  is_active: boolean;
  consecutive_failures: number;
  last_success_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const WEBHOOK_EVENTS = [
  "transaction.created",
  "transaction.completed",
  "transaction.failed",
  "fraud.alert",
  "notification.email",
];

router.get(
  "/",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = await query<WebhookRow>(
        `SELECT * FROM webhook_endpoints WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [req.tenantId!]
      );
      sendSuccess(res, rows);
    } catch (err) { next(err); }
  }
);

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1).default(WEBHOOK_EVENTS),
});

router.post(
  "/",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createSchema.safeParse(req.body);
      if (!body.success) throw new ValidationError("Invalid request", body.error.flatten());

      const row = await queryOne<WebhookRow>(
        `INSERT INTO webhook_endpoints (tenant_id, url, events)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [req.tenantId!, body.data.url, body.data.events]
      );
      if (!row) throw new Error("Failed to create webhook endpoint");
      sendSuccess(res, row, 201);
    } catch (err) { next(err); }
  }
);

router.delete(
  "/:id",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const row = await queryOne<{ id: string }>(
        `UPDATE webhook_endpoints SET is_active = FALSE WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [req.params["id"]!, req.tenantId!]
      );
      if (!row) throw new NotFoundError("Webhook endpoint");
      sendSuccess(res, { message: "Webhook endpoint disabled" });
    } catch (err) { next(err); }
  }
);

router.post(
  "/:id/test",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const endpoint = await queryOne<WebhookRow>(
        `SELECT * FROM webhook_endpoints WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
        [req.params["id"]!, req.tenantId!]
      );
      if (!endpoint) throw new NotFoundError("Webhook endpoint");

      const payload = JSON.stringify({
        event: "webhook.test",
        tenantId: req.tenantId,
        timestamp: new Date().toISOString(),
        data: { message: "This is a test webhook from FinFlow" },
      });

      const signature = crypto
        .createHmac("sha256", "test-secret")
        .update(payload)
        .digest("hex");

      // Fire-and-forget HTTP request to the webhook URL
      const urlObj = new URL(endpoint.url);
      const lib = urlObj.protocol === "https:" ? https : http;
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "X-FinFlow-Signature": `sha256=${signature}`,
          "X-FinFlow-Event": "webhook.test",
        },
        timeout: 5000,
      };

      let responseCode = 0;
      let responseBody = "";
      await new Promise<void>((resolve) => {
        const httpReq = lib.request(requestOptions, (httpRes) => {
          responseCode = httpRes.statusCode ?? 0;
          httpRes.on("data", (d: Buffer) => { responseBody += d.toString(); });
          httpRes.on("end", resolve);
        });
        httpReq.on("error", resolve);
        httpReq.on("timeout", () => { httpReq.destroy(); resolve(); });
        httpReq.write(payload);
        httpReq.end();
      });

      sendSuccess(res, {
        delivered: responseCode >= 200 && responseCode < 300,
        responseCode,
        responseBody: responseBody.slice(0, 500),
      });
    } catch (err) { next(err); }
  }
);

export default router;
