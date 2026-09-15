import { NextResponse } from "next/server";
import { logger } from "@/lib/logging/logger";
import { redact } from "@/lib/logging/redact";
import { AppError, toAppError } from "@/lib/errors/app-error";
import { getDb } from "@/lib/db/client";
import { errorLog } from "@/lib/db/schema";

interface SafeErrorBody {
  error: {
    code: AppError["code"];
    message: string;
    fieldErrors?: Readonly<Record<string, readonly string[]>>;
  };
}

/**
 * Best-effort persistence of non-operational (unexpected, 500-class)
 * errors to `error_log` (self-hosted observability, Phase 15 Hardening —
 * see `lib/db/schema.ts`'s `errorLog` doc comment). Never allowed to throw
 * past this function: a failure here must never mask or replace the
 * original error the caller is already in the middle of reporting.
 * `context` is the SAME redacted object already sent to `logger.error`
 * (CLAUDE.md rule 8 — a DB row is not exempt from redaction just because
 * it isn't stdout).
 */
async function persistInternalError(appError: AppError, context: Record<string, unknown>): Promise<void> {
  try {
    await getDb()
      .insert(errorLog)
      .values({
        code: appError.code,
        httpStatus: appError.httpStatus,
        message: appError.message,
        context: redact(context),
      });
  } catch (persistErr) {
    logger.warn("error_log.persist_failed", { error: persistErr instanceof Error ? persistErr.message : String(persistErr) });
  }
}

/**
 * Converts any thrown value into a safe JSON HTTP response and logs the
 * full detail server-side (redacted) first. Route handlers should funnel
 * every caught error through this so the client never sees raw error
 * detail (stack traces, DB error text) for non-operational failures —
 * CLAUDE.md rule 8, Phase 3 §8 error-state UX.
 */
export async function toSafeErrorResponse(err: unknown, requestContext?: Record<string, unknown>): Promise<NextResponse<SafeErrorBody>> {
  const appError = toAppError(err);

  if (appError.isOperational) {
    logger.warn("request.error.operational", {
      code: appError.code,
      httpStatus: appError.httpStatus,
      ...requestContext,
    });
  } else {
    const context = {
      code: appError.code,
      httpStatus: appError.httpStatus,
      message: appError.message,
      cause: appError.cause,
      detail: appError.detail,
      ...requestContext,
    };
    logger.error("request.error.internal", context);
    await persistInternalError(appError, context);
  }

  const body: SafeErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...("fieldErrors" in appError && (appError as { fieldErrors?: unknown }).fieldErrors
        ? { fieldErrors: (appError as { fieldErrors?: Record<string, readonly string[]> }).fieldErrors }
        : {}),
    },
  };

  return NextResponse.json(body, { status: appError.httpStatus });
}
