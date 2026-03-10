import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authMiddleware, requireRole } from "../middleware/auth";
import {
  registerTenantAndAdmin,
  login,
  refreshTokens,
  logout,
  createApiKey,
  revokeApiKey,
} from "../services/auth.service";
import { sendSuccess, sendError } from "../utils/response";
import { query } from "@finflow/database";
import { ValidationError } from "../utils/errors";

const router = Router();

// ─── Schemas ────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  tenantName: z.string().min(2).max(100),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

// ─── POST /auth/register ────────────────────────────────────────────────────

router.post(
  "/register",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = registerSchema.safeParse(req.body);
      if (!body.success) throw new ValidationError("Invalid request", body.error.flatten());

      const { tenant, user } = await registerTenantAndAdmin(body.data);

      sendSuccess(
        res,
        {
          tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
          user: { id: user.id, email: user.email, role: user.role },
        },
        201
      );
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /auth/login ───────────────────────────────────────────────────────

router.post(
  "/login",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = loginSchema.safeParse(req.body);
      if (!body.success) throw new ValidationError("Invalid request", body.error.flatten());

      const { accessToken, refreshToken, user } = await login(body.data);

      // Set refresh token as httpOnly cookie
      res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: process.env["NODE_ENV"] === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/",
      });

      sendSuccess(res, {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenant_id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /auth/refresh ─────────────────────────────────────────────────────

router.post(
  "/refresh",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawRefreshToken =
        (req.cookies as Record<string, string | undefined>)["refresh_token"] ??
        (req.body as Record<string, string | undefined>)["refreshToken"];

      if (!rawRefreshToken) {
        sendError(res, 401, "AUTHENTICATION_ERROR", "Refresh token not provided");
        return;
      }

      const { accessToken, refreshToken, user } = await refreshTokens(rawRefreshToken);

      res.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env["NODE_ENV"] === "production",
        sameSite: process.env["NODE_ENV"] === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      sendSuccess(res, {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          tenantId: user.tenant_id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /auth/logout ──────────────────────────────────────────────────────

router.post(
  "/logout",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization ?? "";
      const token = authHeader.replace("Bearer ", "");
      await logout(token, req.user!.id);

      res.clearCookie("refresh_token", { path: "/" });
      sendSuccess(res, { message: "Logged out successfully" });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /auth/me ───────────────────────────────────────────────────────────

router.get(
  "/me",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      interface UserRow {
        id: string; tenant_id: string; email: string;
        first_name: string; last_name: string; role: string;
        created_at: Date;
      }
      const user = await query<UserRow>(
        `SELECT u.id, u.tenant_id, u.email, u.first_name, u.last_name, u.role, u.created_at,
                t.name as tenant_name, t.slug as tenant_slug
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         WHERE u.id = $1`,
        [req.user!.id]
      );
      sendSuccess(res, user[0] ?? null);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /auth/api-keys ────────────────────────────────────────────────────

router.post(
  "/api-keys",
  authMiddleware,
  requireRole("admin", "superadmin"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = createApiKeySchema.safeParse(req.body);
      if (!body.success) throw new ValidationError("Invalid request", body.error.flatten());

      const expiresAt = body.data.expiresAt ? new Date(body.data.expiresAt) : undefined;
      const apiKey = await createApiKey(
        req.user!.tenantId,
        req.user!.id,
        body.data.name,
        expiresAt
      );

      sendSuccess(
        res,
        {
          id: apiKey.id,
          name: apiKey.name,
          keyPrefix: apiKey.key_prefix,
          key: apiKey.rawKey, // Raw key shown only once
          expiresAt: apiKey.expires_at,
          createdAt: apiKey.created_at,
        },
        201
      );
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /auth/api-keys ─────────────────────────────────────────────────────

router.get(
  "/api-keys",
  authMiddleware,
  requireRole("admin", "superadmin"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      interface ApiKeyRow {
        id: string; name: string; key_prefix: string;
        last_used_at: Date | null; expires_at: Date | null;
        is_active: boolean; created_at: Date;
      }
      const keys = await query<ApiKeyRow>(
        `SELECT id, name, key_prefix, last_used_at, expires_at, is_active, created_at
         FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [req.user!.tenantId]
      );
      sendSuccess(res, keys);
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /auth/api-keys/:id ──────────────────────────────────────────────

router.delete(
  "/api-keys/:id",
  authMiddleware,
  requireRole("admin", "superadmin"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await revokeApiKey(req.params["id"]!, req.user!.tenantId);
      sendSuccess(res, { message: "API key revoked" });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
