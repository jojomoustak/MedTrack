import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseOrThrow } from "@/lib/validation/validate";
import { ValidationError } from "@/lib/errors/app-error";
import { moneyCentsSchema, quantityValueSchema, uuidSchema } from "@/lib/validation/common";

describe("parseOrThrow", () => {
  const schema = z.object({ email: z.email(), age: z.number().int().positive() });

  it("returns the parsed data on success", () => {
    const result = parseOrThrow(schema, { email: "a@example.com", age: 30 });
    expect(result).toEqual({ email: "a@example.com", age: 30 });
  });

  it("throws a ValidationError (never a raw ZodError) with field-keyed errors on failure", () => {
    try {
      parseOrThrow(schema, { email: "not-an-email", age: -1 });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const validationError = err as ValidationError;
      expect(validationError.fieldErrors).toHaveProperty("email");
      expect(validationError.fieldErrors).toHaveProperty("age");
    }
  });

  it("never leaks the raw invalid input value back into the error for a sensitive field", () => {
    try {
      parseOrThrow(schema, { email: 12345, age: "not-a-number" });
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = JSON.stringify((err as ValidationError).fieldErrors);
      // Zod messages describe the *type* mismatch, not required to echo the value —
      // this asserts our wrapper doesn't add the raw payload on top of that.
      expect(message).not.toContain("12345");
    }
  });
});

describe("domain validation primitives", () => {
  it("uuidSchema accepts valid UUIDs and rejects everything else", () => {
    expect(uuidSchema.safeParse("11111111-1111-4111-8111-111111111111").success).toBe(true);
    expect(uuidSchema.safeParse("not-a-uuid").success).toBe(false);
  });

  it("moneyCentsSchema rejects negative and non-integer values (CLAUDE.md rule 6)", () => {
    expect(moneyCentsSchema.safeParse(1250).success).toBe(true);
    expect(moneyCentsSchema.safeParse(-1).success).toBe(false);
    expect(moneyCentsSchema.safeParse(12.5).success).toBe(false);
  });

  it("quantityValueSchema rejects zero/negative quantities and more than 3 decimal places", () => {
    expect(quantityValueSchema.safeParse(1.5).success).toBe(true);
    expect(quantityValueSchema.safeParse(0).success).toBe(false);
    expect(quantityValueSchema.safeParse(-2).success).toBe(false);
    expect(quantityValueSchema.safeParse(1.2345).success).toBe(false);
  });
});
