/**
 * Convention for validating input at every API route / server action
 * boundary before it reaches domain logic (`protecting-health-data`,
 * CLAUDE.md rule 7 — never trust client input, including its shape).
 *
 * Usage:
 *   const input = parseOrThrow(createMedicationSchema, await req.json());
 */
import type { ZodType, z } from "zod";
import { ValidationError } from "@/lib/errors/app-error";

/**
 * Parses `data` against `schema`. On failure, throws a `ValidationError`
 * carrying a safe, field-keyed error map — never the raw Zod issue objects
 * (which can echo back input verbatim) directly to the client.
 */
export function parseOrThrow<TSchema extends ZodType>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join(".") : "_root";
      (fieldErrors[path] ??= []).push(issue.message);
    }
    throw new ValidationError("The submitted data is invalid.", fieldErrors);
  }
  return result.data;
}

/** Same as `parseOrThrow`, but for data that's already partially trusted (e.g. re-validating a DB row shape). */
export function safeParseResult<TSchema extends ZodType>(schema: TSchema, data: unknown) {
  return schema.safeParse(data);
}
