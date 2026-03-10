import type { Request, Response, NextFunction } from "express";
import { query } from "@finflow/database";

interface AuditableRequest extends Request {
  requestId: string;
  user?: { id: string; tenantId: string; email: string; role: import("@finflow/types").Role };
  tenantId?: string;
}

export function auditLog(action: string, resource: string) {
  return (req: AuditableRequest, res: Response, next: NextFunction): void => {
    // After response is sent, write audit log
    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const resourceId = (req.params["id"] as string | undefined) ?? null;

        query(
          `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, ip_address, user_agent, request_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            req.tenantId ?? req.user?.tenantId ?? null,
            req.user?.id ?? null,
            action,
            resource,
            resourceId,
            req.ip ?? null,
            req.headers["user-agent"] ?? null,
            req.requestId,
            JSON.stringify({ method: req.method, path: req.path, status: res.statusCode }),
          ]
        ).catch((err: unknown) => {
          console.error("[audit] Failed to write audit log:", err);
        });
      }
    });

    next();
  };
}
