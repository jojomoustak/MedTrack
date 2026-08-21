/**
 * Branded ID types so an `AccountId` can't be passed where a `ProfileId`
 * is expected, etc. — cheap, compile-time-only protection against exactly
 * the "ownership/ID confusion" class of bug CLAUDE.md rule 7 cares about.
 * These are type-level only; at runtime an ID is just a UUID string.
 *
 * Deliberately uses the global `crypto.randomUUID()` (Web Crypto API),
 * not `node:crypto`'s import — this module is part of the domain layer,
 * which per ADR-001/Phase 1 §2 runs identically in both the server
 * (Node.js) and client (browser/WebView) containers; a Node-specific
 * import here would break the client bundle. `crypto.randomUUID` is
 * available as a global in Node.js, evergreen browsers, and Median's
 * WebView alike.
 */
type Brand<T, B extends string> = T & { readonly __brand: B };

export type AccountId = Brand<string, "AccountId">;
export type ProfileId = Brand<string, "ProfileId">;
export type UserMedicationId = Brand<string, "UserMedicationId">;
export type MedicationScheduleId = Brand<string, "MedicationScheduleId">;
export type DoseEventId = Brand<string, "DoseEventId">;
export type MedicationPackageId = Brand<string, "MedicationPackageId">;
export type ClientMutationId = Brand<string, "ClientMutationId">;

/** Generates a new client-generatable UUID for any offline-createable entity (Phase 2 §0). */
export function newId<T extends string = string>(): Brand<string, T> {
  return crypto.randomUUID() as Brand<string, T>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Casts a validated UUID string into a branded ID type. Callers must validate the format first (e.g. via Zod). */
export function asId<T extends string>(value: string): Brand<string, T> {
  return value as Brand<string, T>;
}
