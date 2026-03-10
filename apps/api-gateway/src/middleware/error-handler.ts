import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError, ValidationError } from "../utils/errors";
import { sendError } from "../utils/response";
import { logger } from "../utils/logger";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId ?? "unknown";

  if (err instanceof ZodError) {
    const details = err.flatten().fieldErrors;
    logger.warn("Validation error", { requestId, details });
    sendError(res, 422, "VALIDATION_ERROR", "Request validation failed", details);
    return;
  }

  if (err instanceof ValidationError) {
    logger.warn("Validation error", { requestId, message: err.message });
    sendError(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof AppError) {
    if (!err.isOperational || err.statusCode >= 500) {
      logger.error("Application error", { requestId, error: err.message, stack: err.stack });
    } else {
      logger.warn("Operational error", { requestId, code: err.code, message: err.message });
    }
    sendError(res, err.statusCode, err.code, err.message);
    return;
  }

  // Unknown error — don't leak internals
  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error(`Unhandled error: ${message}`, { requestId, stack: err instanceof Error ? err.stack : undefined });
  sendError(res, 500, "INTERNAL_ERROR", "An internal error occurred");
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`);
}
