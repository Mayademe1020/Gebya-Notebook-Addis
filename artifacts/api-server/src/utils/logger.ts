/**
 * logger.ts — Simple structured logging utility for the API server.
 *
 * Provides methods for info, debug, warn, and error logging with optional context data.
 * All messages are prefixed with timestamps and log level.
 */

type LogLevel = "info" | "debug" | "warn" | "error";
type LogContext = Record<string, unknown>;

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatLogMessage(
  level: LogLevel,
  message: string,
  context?: LogContext
): string {
  const timestamp = formatTimestamp();
  const contextStr = context && Object.keys(context).length > 0 
    ? ` ${JSON.stringify(context)}`
    : "";
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

export const logger = {
  info: (message: string, context?: LogContext): void => {
    console.log(formatLogMessage("info", message, context));
  },

  debug: (message: string, context?: LogContext): void => {
    if (process.env.DEBUG === "true" || process.env.DEBUG === "1") {
      console.log(formatLogMessage("debug", message, context));
    }
  },

  warn: (message: string, context?: LogContext): void => {
    console.warn(formatLogMessage("warn", message, context));
  },

  error: (message: string, context?: LogContext): void => {
    console.error(formatLogMessage("error", message, context));
  },
};
