/**
 * Reusable Zod primitives for MedTracking's domain conventions
 * (`modeling-medication-domain`, Phase 2 §0/§6). Feature-level schemas
 * (Phase 5+) should compose these rather than redefining ad hoc
 * `z.string()`/`z.number()` checks per entity.
 */
import { z } from "zod";

/** Client-generatable stable entity ID (Phase 2 §0). */
export const uuidSchema = z.uuid();

/** Quantities are always a value + a unit — never a bare number (Phase 2 §0). */
export const quantityValueSchema = z
  .number()
  .finite()
  .positive()
  .refine((v) => Number.isFinite(v) && Math.round(v * 1000) === v * 1000, {
    message: "Quantity values support at most 3 decimal places (NUMERIC(12,3)).",
  });

export const quantityUnitSchema = z.enum([
  "tablet",
  "capsule",
  "ml",
  "mg",
  "mcg",
  "g",
  "dose",
  "spray",
  "drop",
  "sachet",
  "patch",
  "injection",
  "other",
]);

/** Money is always integer cents, never a float (CLAUDE.md rule 6, Phase 2 §6). */
export const moneyCentsSchema = z.int().nonnegative();

export const currencySchema = z.string().length(3).default("EUR");

export const syncStateSchema = z.enum([
  "local-only",
  "pending",
  "syncing",
  "synced",
  "conflict",
  "failed",
  "deleted",
]);

/** The idempotency key every outbox mutation must carry (designing-offline-sync). */
export const clientMutationIdSchema = z.uuid();

/** Optimistic-concurrency version field. */
export const versionSchema = z.int().positive();
