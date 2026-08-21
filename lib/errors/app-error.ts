/**
 * Typed error hierarchy.
 *
 * Distinguishes errors that are safe to translate and show directly to a
 * user (`AppError` and its subclasses — validation failures, "not found",
 * "conflict", auth failures) from truly unexpected/internal errors, which
 * must never leak raw detail (stack traces, DB error text, file paths) to
 * the client — only ever a generic message, with the real detail logged
 * server-side (see `lib/logging`).
 *
 * Route handlers should catch everything and pass it through
 * `toSafeErrorResponse()` (see `lib/errors/http.ts`) rather than hand-rolling
 * per-route error translation.
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "CONFIG_ERROR"
  | "INTERNAL_ERROR";

/**
 * Base class for every error the application deliberately throws.
 *
 * `isOperational: true` marks an error as an anticipated, safe-to-surface
 * condition (bad input, missing resource, permission denied, etc.) rather
 * than a bug/crash. `message` on operational errors is written to be
 * user-safe by construction; `message` on non-operational errors must
 * never be sent to the client verbatim.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly isOperational: boolean;
  /** Optional structured detail, safe for logs but NOT for the client response body. */
  readonly detail?: Readonly<Record<string, unknown>>;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number,
    options?: { isOperational?: boolean; detail?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.isOperational = options?.isOperational ?? true;
    this.detail = options?.detail;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Input failed schema/domain validation. Safe to show `message` (and field detail) to the user. */
export class ValidationError extends AppError {
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;

  constructor(message = "The submitted data is invalid.", fieldErrors?: Record<string, readonly string[]>) {
    super("VALIDATION_ERROR", message, 400, { detail: fieldErrors });
    this.fieldErrors = fieldErrors;
  }
}

/** No valid authenticated session. */
export class AuthenticationError extends AppError {
  constructor(message = "You need to sign in to continue.") {
    super("AUTHENTICATION_ERROR", message, 401);
  }
}

/**
 * Authenticated, but not authorized for the requested resource/action.
 * Deliberately does not reveal whether the resource exists — callers should
 * generally prefer `NotFoundError` for "this isn't yours" to avoid leaking
 * existence of other users' data (per protecting-health-data).
 */
export class AuthorizationError extends AppError {
  constructor(message = "You don't have access to that.") {
    super("AUTHORIZATION_ERROR", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "We couldn't find that.") {
    super("NOT_FOUND", message, 404);
  }
}

/** Optimistic-concurrency / sync conflict (Phase 2 §5 per-entity conflict table). */
export class ConflictError extends AppError {
  constructor(message = "This was changed elsewhere. Please refresh and try again.") {
    super("CONFLICT", message, 409);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many attempts. Please wait and try again.") {
    super("RATE_LIMITED", message, 429);
  }
}

/** Missing/malformed server configuration. Never operational — always a deploy/ops bug. */
export class ConfigError extends AppError {
  constructor(message: string) {
    super("CONFIG_ERROR", message, 500, { isOperational: false });
  }
}

/**
 * Wraps an unexpected failure (DB error, third-party call failure, a bug).
 * `message` is intentionally generic — the original error's real detail
 * belongs in `cause`/logs only, never in the HTTP response body.
 */
export class InternalError extends AppError {
  constructor(cause?: unknown, detail?: Record<string, unknown>) {
    super("INTERNAL_ERROR", "Something went wrong on our end. Please try again.", 500, {
      isOperational: false,
      cause,
      detail,
    });
  }
}

/** Normalizes any thrown value into an `AppError`, wrapping unknowns as `InternalError`. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new InternalError(err);
}
