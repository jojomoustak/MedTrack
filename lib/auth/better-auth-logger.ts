import { logger, type LogLevel } from "@/lib/logging/logger";

const EMAIL_ADDRESS = /[^\s@:]+@[^\s@]+/g;

/**
 * Better Auth's own log lines, through this app's logger (CLAUDE.md rule 8;
 * security review 2026-10-20). Its default writes straight to the console,
 * extra arguments included: on a failed sign-up insert that argument is the
 * database error, whose text carries the inserted values (the email and
 * name). So only the message is kept, with any email address in it masked
 * ("Sign-up attempt for existing email: …" is one of its info lines), and
 * the level is pinned at warn so those info lines stay off.
 */
export const betterAuthLogger = {
  level: "warn" as const,
  log: (level: LogLevel, message: string) => {
    logger[level]("auth.library", { message: String(message).replace(EMAIL_ADDRESS, "[email]") });
  },
};
