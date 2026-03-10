import { incrementCounter } from "@finflow/redis";
import { config } from "../config";

/**
 * Velocity Check: flag if more than N transactions from same account in W seconds.
 */
export async function velocityCheck(accountId: string): Promise<boolean> {
  const key = `fraud:velocity:${accountId}`;
  const count = await incrementCounter(key, config.VELOCITY_WINDOW_SECONDS);
  return count > config.VELOCITY_MAX_TRANSACTIONS;
}
