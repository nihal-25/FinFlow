import { getRedisClient } from "./client";
import crypto from "crypto";

const LOCK_PREFIX = "finflow:lock:";

export interface DistributedLock {
  key: string;
  token: string;
  release: () => Promise<void>;
}

/**
 * Acquires a distributed lock using SET NX with TTL.
 * Returns null if the lock cannot be acquired within the retry window.
 */
export async function acquireLock(
  resource: string,
  ttlMs: number = 30_000,
  retryDelayMs: number = 100,
  maxRetries: number = 50
): Promise<DistributedLock | null> {
  const redis = getRedisClient();
  const key = `${LOCK_PREFIX}${resource}`;
  const token = crypto.randomBytes(16).toString("hex");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await redis.set(key, token, "PX", ttlMs, "NX");
    if (result === "OK") {
      return {
        key,
        token,
        release: async () => {
          await releaseLock(key, token);
        },
      };
    }
    if (attempt < maxRetries) {
      await sleep(retryDelayMs);
    }
  }

  return null;
}

/**
 * Safely releases a lock only if we still own it (atomic via Lua script).
 */
async function releaseLock(key: string, token: string): Promise<void> {
  const redis = getRedisClient();
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, key, token);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
