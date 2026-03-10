import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { query, queryOne, withTransaction } from "@finflow/database";
import { blacklistToken } from "@finflow/redis";
import { config } from "../config";
import {
  ConflictError,
  AuthenticationError,
  NotFoundError,
} from "../utils/errors";
import type { JwtPayload, Role } from "@finflow/types";

const SALT_ROUNDS = 12;
const API_KEY_PREFIX = "ff_live_";

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
}

export interface RegisterInput {
  tenantName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function registerTenantAndAdmin(input: RegisterInput) {
  const { tenantName, firstName, lastName, email, password } = input;

  const slug = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const webhookSecret = crypto.randomBytes(32).toString("hex");

  return withTransaction(async (client) => {
    // Check slug uniqueness
    const existing = await client.query(
      "SELECT id FROM tenants WHERE slug = $1 OR EXISTS (SELECT 1 FROM users WHERE email = $2)",
      [slug, email]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError("Tenant slug or email already in use");
    }

    const tenantResult = await client.query<TenantRow>(
      `INSERT INTO tenants (name, slug, webhook_secret)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug`,
      [tenantName, slug, webhookSecret]
    );
    const tenant = tenantResult.rows[0];
    if (!tenant) throw new Error("Failed to create tenant");

    const userResult = await client.query<UserRow>(
      `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, 'admin')
       RETURNING id, tenant_id, email, first_name, last_name, role`,
      [tenant.id, email, passwordHash, firstName, lastName]
    );
    const user = userResult.rows[0];
    if (!user) throw new Error("Failed to create user");

    return { tenant, user };
  });
}

export async function login(input: LoginInput) {
  const user = await queryOne<UserRow>(
    `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.first_name, u.last_name, u.role, u.is_active
     FROM users u
     WHERE u.email = $1`,
    [input.email]
  );

  if (!user || !user.is_active) {
    throw new AuthenticationError("Invalid credentials");
  }

  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) {
    throw new AuthenticationError("Invalid credentials");
  }

  const { accessToken, refreshToken } = await generateTokenPair(user);
  return { accessToken, refreshToken, user };
}

export async function refreshTokens(rawRefreshToken: string) {
  let payload: JwtPayload;
  try {
    payload = jwt.verify(rawRefreshToken, config.JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    throw new AuthenticationError("Invalid or expired refresh token");
  }

  if (payload.type !== "refresh") {
    throw new AuthenticationError("Invalid token type");
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(rawRefreshToken)
    .digest("hex");

  interface RefreshTokenRow { id: string; user_id: string; expires_at: Date; }
  const stored = await queryOne<RefreshTokenRow>(
    `SELECT id, user_id, expires_at FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash]
  );

  if (!stored || new Date(stored.expires_at) < new Date()) {
    throw new AuthenticationError("Refresh token is invalid or expired");
  }

  const user = await queryOne<UserRow>(
    `SELECT id, tenant_id, email, role, is_active FROM users WHERE id = $1`,
    [stored.user_id]
  );

  if (!user || !user.is_active) {
    throw new AuthenticationError("User not found or inactive");
  }

  // Rotate: delete old, issue new
  await query("DELETE FROM refresh_tokens WHERE id = $1", [stored.id]);
  const tokens = await generateTokenPair(user);
  return { ...tokens, user };
}

export async function logout(accessToken: string, userId: string): Promise<void> {
  let payload: JwtPayload | null = null;
  try {
    payload = jwt.decode(accessToken) as JwtPayload;
  } catch {
    // ignore
  }

  if (payload) {
    const jti = `${payload.sub}:${payload.iat}`;
    const ttl = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
    if (ttl > 0) {
      await blacklistToken(jti, ttl);
    }
  }

  // Revoke all refresh tokens for user
  await query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
}

export async function createApiKey(
  tenantId: string,
  userId: string,
  name: string,
  expiresAt?: Date
) {
  const rawKey = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 16);

  interface ApiKeyRow { id: string; name: string; key_prefix: string; created_at: Date; expires_at: Date | null; }
  const result = await queryOne<ApiKeyRow>(
    `INSERT INTO api_keys (tenant_id, user_id, name, key_hash, key_prefix, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, key_prefix, created_at, expires_at`,
    [tenantId, userId, name, keyHash, keyPrefix, expiresAt ?? null]
  );

  if (!result) throw new Error("Failed to create API key");

  return { ...result, rawKey };
}

export async function revokeApiKey(id: string, tenantId: string): Promise<void> {
  const result = await query(
    `UPDATE api_keys SET is_active = FALSE WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  if (!result.length) {
    throw new NotFoundError("API key");
  }
}

async function generateTokenPair(user: UserRow) {
  const accessPayload: Omit<JwtPayload, "iat" | "exp"> = {
    sub: user.id,
    tenantId: user.tenant_id,
    email: user.email,
    role: user.role,
    type: "access",
  };

  const accessToken = jwt.sign(accessPayload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);

  const refreshPayload: Omit<JwtPayload, "iat" | "exp"> = {
    sub: user.id,
    tenantId: user.tenant_id,
    email: user.email,
    role: user.role,
    type: "refresh",
  };

  const refreshToken = jwt.sign(refreshPayload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);

  const tokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt]
  );

  return { accessToken, refreshToken };
}
