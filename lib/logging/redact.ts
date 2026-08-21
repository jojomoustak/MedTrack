/**
 * Redaction, enforced by code (Phase 1 risk R12), not left to call-site
 * discipline. Every value passed through `lib/logging/logger.ts` is run
 * through `redact()` first — there is no "raw" bypass exported from this
 * module on purpose.
 *
 * Strategy: deny-list key names (case/separator-insensitive) that could
 * carry medication/dose/health content or secrets, applied recursively to
 * any nested object/array, regardless of where in the object graph they
 * appear. This is intentionally conservative — it's better to over-redact
 * an ambiguous field name than to leak health data or a credential.
 */

const REDACTED = "[redacted]";
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;

// Key fragments (matched case-insensitively, ignoring separators) that
// indicate health content or secrets and must never reach a log line.
const DENYLIST_FRAGMENTS = [
  // health / medication domain
  "medication",
  "dose",
  "schedule",
  "prescription",
  "diagnos",
  "symptom",
  "ingredient",
  "strength",
  "dosage",
  "note",
  "inventory",
  "batch",
  "condition",
  "allerg",
  // identity / PII
  "email",
  "displayname",
  "firstname",
  "lastname",
  "fullname",
  "address",
  "phone",
  "dob",
  "birthdate",
  // secrets / credentials / session material
  "password",
  "secret",
  "token",
  "hash",
  "credential",
  "cookie",
  "authorization",
  "apikey",
  "privatekey",
  "pepper",
  "salt",
  "ssn",
  // raw network identity — only the HMAC'd ip_hash column may be stored,
  // never a raw ip/useragent in a log line
  "ip",
  "useragent",
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isDeniedKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return DENYLIST_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function truncateString(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]` : value;
}

/**
 * Deep-redacts a value for safe structured logging.
 * - Object/array keys matching the denylist are replaced with `"[redacted]"`.
 * - Non-plain objects (Error, Date, etc.) are converted to safe summaries.
 * - Depth/array-length/string-length are bounded to keep log lines small
 *   and to stop an accidentally-nested health object from spilling detail
 *   through non-denied wrapper keys.
 */
export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (typeof value === "bigint") return value.toString();

  if (depth >= MAX_DEPTH) return "[max-depth]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message),
      // stack intentionally omitted — can contain path/query detail
    };
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    seen.add(value);

    if (Array.isArray(value)) {
      return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1, seen));
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isDeniedKey(key) ? REDACTED : redact(val, depth + 1, seen);
    }
    return result;
  }

  return "[unsupported]";
}

/**
 * Short, non-reversible correlation token for an identifier (account id,
 * profile id, etc.) — safe to log for correlating requests without
 * exposing the real ID. Not cryptographically keyed on purpose (this is
 * for log correlation, not security) — never use this for the
 * `account_session.ip_hash` HMAC, which must use the server-side pepper.
 */
export function pseudonymize(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `id_${Math.abs(hash).toString(36)}`;
}
