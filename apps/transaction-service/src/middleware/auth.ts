import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { queryOne } from "@finflow/database";
import { config } from "../config";
import { AuthenticationError, AuthorizationError } from "../utils/errors";
import type { Role, JwtPayload } from "@finflow/types";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: { id: string; tenantId: string; email: string; role: Role };
      tenantId?: string;
    }
  }
}

export async function jwtMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) throw new AuthenticationError("Bearer token required");

    const token = authHeader.slice(7);
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as JwtPayload;
    } catch {
      throw new AuthenticationError("Invalid or expired token");
    }

    req.user = { id: payload.sub, tenantId: payload.tenantId, email: payload.email, role: payload.role as Role };
    req.tenantId = payload.tenantId;
    next();
  } catch (err) { next(err); }
}

export async function apiKeyMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const rawKey = req.headers["x-api-key"] as string | undefined;
    if (!rawKey) throw new AuthenticationError("API key required");

    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    interface ApiKeyRow { id: string; tenant_id: string; user_id: string; is_active: boolean; expires_at: Date | null; }
    interface UserRow { id: string; email: string; role: Role; }

    const apiKey = await queryOne<ApiKeyRow>(
      `SELECT id, tenant_id, user_id, is_active, expires_at FROM api_keys WHERE key_hash = $1`,
      [keyHash]
    );
    if (!apiKey || !apiKey.is_active) throw new AuthenticationError("Invalid API key");
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) throw new AuthenticationError("API key expired");

    const user = await queryOne<UserRow>(`SELECT id, email, role FROM users WHERE id = $1 AND is_active = TRUE`, [apiKey.user_id]);
    if (!user) throw new AuthenticationError("User not found");

    req.user = { id: user.id, tenantId: apiKey.tenant_id, email: user.email, role: user.role };
    req.tenantId = apiKey.tenant_id;
    next();
  } catch (err) { next(err); }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.headers.authorization?.startsWith("Bearer ")) jwtMiddleware(req, res, next);
  else if (req.headers["x-api-key"]) apiKeyMiddleware(req, res, next);
  else next(new AuthenticationError("Authentication required"));
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) { next(new AuthenticationError()); return; }
    if (!roles.includes(req.user.role)) { next(new AuthorizationError()); return; }
    next();
  };
}
