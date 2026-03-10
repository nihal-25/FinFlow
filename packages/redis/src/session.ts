import { getRedisClient } from "./client";

const SESSION_PREFIX = "finflow:session:";
const TOKEN_BLACKLIST_PREFIX = "finflow:blacklist:";

export async function setSession(
  sessionId: string,
  data: Record<string, unknown>,
  ttlSeconds: number = 900 // 15 minutes
): Promise<void> {
  const redis = getRedisClient();
  await redis.setex(`${SESSION_PREFIX}${sessionId}`, ttlSeconds, JSON.stringify(data));
}

export async function getSession<T extends Record<string, unknown>>(
  sessionId: string
): Promise<T | null> {
  const redis = getRedisClient();
  const value = await redis.get(`${SESSION_PREFIX}${sessionId}`);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`${SESSION_PREFIX}${sessionId}`);
}

export async function blacklistToken(
  jti: string,
  ttlSeconds: number
): Promise<void> {
  const redis = getRedisClient();
  await redis.setex(`${TOKEN_BLACKLIST_PREFIX}${jti}`, ttlSeconds, "1");
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  const redis = getRedisClient();
  const result = await redis.get(`${TOKEN_BLACKLIST_PREFIX}${jti}`);
  return result !== null;
}
