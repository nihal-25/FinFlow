import { getRedisClient } from "./client";

const RATE_LIMIT_PREFIX = "finflow:ratelimit:";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

/**
 * Sliding window rate limiter using Redis sorted sets.
 * Tracks request timestamps in a sorted set and counts within the window.
 */
export async function slidingWindowRateLimit(
  identifier: string,
  windowMs: number,
  maxRequests: number
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const key = `${RATE_LIMIT_PREFIX}${identifier}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipeline = redis.pipeline();
  // Remove expired entries
  pipeline.zremrangebyscore(key, 0, windowStart);
  // Count requests in window
  pipeline.zcard(key);
  // Add current request
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  // Set TTL
  pipeline.pexpire(key, windowMs);

  const results = await pipeline.exec();
  const count = (results?.[1]?.[1] as number) ?? 0;

  const allowed = count < maxRequests;
  const remaining = Math.max(0, maxRequests - count - 1);
  const resetAt = now + windowMs;

  return { allowed, remaining, resetAt, limit: maxRequests };
}
