import "server-only";
import { redact } from "@/server/compliance/redact";

// The only logger server code should use. Everything passes through redact()
// so emails, names, and tokens never reach log storage.

type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, context?: Record<string, unknown>) {
  const entry = { level, message, ...(context ? { context: redact(context) } : {}), at: new Date().toISOString() };
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};
