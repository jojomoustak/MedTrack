import { describe, expect, it } from "vitest";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
  toAppError,
} from "@/lib/errors/app-error";

describe("AppError hierarchy", () => {
  it("marks domain/validation-style errors as operational (safe to show translated message)", () => {
    const err = new ValidationError("Bad input", { email: ["is required"] });
    expect(err.isOperational).toBe(true);
    expect(err.httpStatus).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.fieldErrors).toEqual({ email: ["is required"] });
  });

  it("marks InternalError as non-operational with a generic, safe message", () => {
    const cause = new Error("raw DB connection string leaked in a stack trace");
    const err = new InternalError(cause);
    expect(err.isOperational).toBe(false);
    expect(err.httpStatus).toBe(500);
    // The generic message must never echo the cause's detail.
    expect(err.message).not.toContain("connection string");
    expect(err.cause).toBe(cause);
  });

  it("assigns the expected HTTP status per error type", () => {
    expect(new AuthenticationError().httpStatus).toBe(401);
    expect(new AuthorizationError().httpStatus).toBe(403);
    expect(new NotFoundError().httpStatus).toBe(404);
    expect(new ConflictError().httpStatus).toBe(409);
  });

  it("toAppError passes AppError instances through unchanged", () => {
    const original = new NotFoundError("gone");
    expect(toAppError(original)).toBe(original);
  });

  it("toAppError wraps unknown thrown values (including non-Error values) as a non-operational InternalError", () => {
    const wrapped1 = toAppError(new Error("boom"));
    expect(wrapped1).toBeInstanceOf(InternalError);
    expect(wrapped1.isOperational).toBe(false);

    const wrapped2 = toAppError("a plain string was thrown");
    expect(wrapped2).toBeInstanceOf(InternalError);
    expect(wrapped2.isOperational).toBe(false);
  });

  it("every AppError subclass is instanceof AppError and instanceof Error", () => {
    const err = new ConflictError();
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ConflictError");
  });
});
