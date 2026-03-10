import { config } from "../config";

type LogLevel = "debug" | "info" | "warn" | "error";

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[config.LOG_LEVEL];
}

function formatLog(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    service: "api-gateway",
    message,
    ...meta,
  };
  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("debug")) console.debug(formatLog("debug", message, meta));
  },
  info(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("info")) console.info(formatLog("info", message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("warn")) console.warn(formatLog("warn", message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    if (shouldLog("error")) console.error(formatLog("error", message, meta));
  },
};
