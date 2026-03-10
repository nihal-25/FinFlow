import { getRedisClient } from "./client";

const CACHE_PREFIX = "finflow:cache:";

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  const value = await redis.get(`${CACHE_PREFIX}${key}`);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = 300
): Promise<void> {
  const redis = getRedisClient();
  await redis.setex(`${CACHE_PREFIX}${key}`, ttlSeconds, JSON.stringify(value));
}

export async function cacheDelete(key: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`${CACHE_PREFIX}${key}`);
}

export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  const redis = getRedisClient();
  const keys = await redis.keys(`${CACHE_PREFIX}${pattern}`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export async function incrementCounter(
  key: string,
  ttlSeconds: number
): Promise<number> {
  const redis = getRedisClient();
  const fullKey = `${CACHE_PREFIX}${key}`;
  const pipeline = redis.pipeline();
  pipeline.incr(fullKey);
  pipeline.expire(fullKey, ttlSeconds);
  const results = await pipeline.exec();
  return (results?.[0]?.[1] as number) ?? 0;
}

export async function getCounter(key: string): Promise<number> {
  const redis = getRedisClient();
  const value = await redis.get(`${CACHE_PREFIX}${key}`);
  return value ? parseInt(value, 10) : 0;
}
