import { closePool } from "@finflow/database";
import { closeRedisClient } from "@finflow/redis";

export default async function globalTeardown(): Promise<void> {
  await Promise.all([closePool(), closeRedisClient()]);
}
