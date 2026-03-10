import type { Response } from "express";
import type { ApiSuccessResponse, ApiErrorResponse, PaginatedResult } from "@finflow/types";

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  meta?: ApiSuccessResponse<T>["meta"]
): void {
  const body: ApiSuccessResponse<T> = meta !== undefined
    ? { success: true, data, meta }
    : { success: true, data };
  res.status(statusCode).json(body);
}

export function sendPaginated<T>(
  res: Response,
  result: PaginatedResult<T>,
  requestId: string
): void {
  const body: ApiSuccessResponse<T[]> = {
    success: true,
    data: result.items,
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      requestId,
    },
  };
  res.status(200).json(body);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
): void {
  const body: ApiErrorResponse = {
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  };
  res.status(statusCode).json(body);
}
