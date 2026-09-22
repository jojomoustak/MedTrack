/**
 * Real production bug found via a live-screenshot design review (2026-09-22):
 * every `numeric(...)` column in this schema comes back from Postgres as
 * TEXT at its full declared scale — "500" inserted into a `numeric(12,3)`
 * column reads back as `"500.000"`, "1" as `"1.000"` — and every call site
 * across the app (`customStrengthValue`, dose/package quantities, ...)
 * was interpolating that raw string directly into the UI. Genuinely
 * user-visible on every screen showing a medication's strength or a dose's
 * quantity, not a display-only nitpick.
 *
 * Pure string trimming, not `Number(...).toFixed(...)`: a numeric column
 * can hold more digits than a JS float safely round-trips, and this only
 * needs to strip trailing zeros the DATABASE already right-padded, never
 * to re-derive precision.
 */
export function formatQuantity(value: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}
