import type { Request, Response, NextFunction } from "express";
import { slidingWindowRateLimit } from "@finflow/redis";
import { RateLimitError } from "../utils/errors";
import { config } from "../config";

export function rateLimitMiddleware(
  windowMs: number = config.RATE_LIMIT_WINDOW_MS,
  maxRequests: number = config.RATE_LIMIT_MAX_REQUESTS
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Identify by API key prefix, user ID, or IP
      const identifier =
        (req.headers["x-api-key"] as string | undefined)?.slice(0, 16) ??
        req.ip ??
        "anonymous";

      const result = await slidingWindowRateLimit(identifier, windowMs, maxRequests);

      res.setHeader("X-RateLimit-Limit", result.limit);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(result.resetAt / 1000));

      if (!result.allowed) {
        next(new RateLimitError());
        return;
      }

      next();
    } catch (err) {
      // If Redis is down, fail open (don't block legitimate traffic)
      next();
    }
  };
}
