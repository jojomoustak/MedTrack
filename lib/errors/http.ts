import { NextResponse } from "next/server";
import { logger } from "@/lib/logging/logger";
import { AppError, toAppError } from "@/lib/errors/app-error";

interface SafeErrorBody {
  error: {
    code: AppError["code"];
    message: string;
    fieldErrors?: Readonly<Record<string, readonly string[]>>;
  };
}

/**
 * Converts any thrown value into a safe JSON HTTP response and logs the
 * full detail server-side (redacted) first. Route handlers should funnel
 * every caught error through this so the client never sees raw error
 * detail (stack traces, DB error text) for non-operational failures —
 * CLAUDE.md rule 8, Phase 3 §8 error-state UX.
 */
export function toSafeErrorResponse(err: unknown, requestContext?: Record<string, unknown>): NextResponse<SafeErrorBody> {
  const appError = toAppError(err);

  if (appError.isOperational) {
    logger.warn("request.error.operational", {
      code: appError.code,
      httpStatus: appError.httpStatus,
      ...requestContext,
    });
  } else {
    logger.error("request.error.internal", {
      code: appError.code,
      httpStatus: appError.httpStatus,
      message: appError.message,
      cause: appError.cause,
      detail: appError.detail,
      ...requestContext,
    });
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
