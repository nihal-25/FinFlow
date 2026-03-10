import Redis from "ioredis";

let redisClient: Redis | null = null;

export function createRedisClient(url: string): Redis {
  if (redisClient) return redisClient;

  redisClient = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 20) return null;
      return Math.min(times * 200, 5000);
    },
  });

  redisClient.on("connect", () => console.log("[redis] Connected"));
  redisClient.on("error", (err) => console.error("[redis] Error:", err.message));
  redisClient.on("reconnecting", () => console.log("[redis] Reconnecting..."));

  return redisClient;
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    throw new Error("Redis client not initialized. Call createRedisClient() first.");
  }
  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export async function redisHealthCheck(): Promise<boolean> {
  try {
    const pong = await getRedisClient().ping();
    return pong === "PONG";
  } catch {
    return false;
  }
}
