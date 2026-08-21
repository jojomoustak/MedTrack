/**
 * Structured, redacted logger. This is the ONLY place in the codebase
 * allowed to call `console.*` (enforced by the `no-console` ESLint rule —
 * see eslint.config.mjs) — every other module must import `logger` from
 * here rather than logging directly, so redaction can never be skipped by
 * accident (Phase 1 risk R12).
 *
 * Output is a single-line JSON object per entry: easy to ship to any log
 * pipeline (Vercel log drains, etc.) without further parsing.
 */
import { redact } from "@/lib/logging/redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  event: string;
  time: string;
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function minLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined;
  if (fromEnv && fromEnv in LEVEL_ORDER) return fromEnv;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function write(level: LogLevel, event: string, context?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;

  const entry: LogEntry = {
    level,
    event,
    time: new Date().toISOString(),
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };

  const line = JSON.stringify(entry);
  // eslint-disable-next-line no-console -- this is the sanctioned sink; every other call site must go through `logger`.
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(line);
}

export const logger = {
  debug: (event: string, context?: LogContext) => write("debug", event, context),
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) => write("error", event, context),
};
