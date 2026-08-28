/**
 * A device-local, user-confirmed GTIN→product mapping (OCR-fallback task
 * spec §12-§15): what a single user's own explicit confirmation of an OCR
 * candidate produces. Deliberately NOT the same table/type as the
 * server's authoritative `medication_identifier` rows (ADR-004-style
 * separation, extended to this task's own "authoritative vs. user-
 * confirmed" boundary) — this is the client-side record that makes the
 * SAME GTIN resolve instantly offline on THIS device next time (spec §15),
 * independent of whether/when it ever reaches the server.
 *
 * `syncedAt: null` means the best-effort background sync
 * (`lib/catalog/client/sync-learned-mappings.ts`) hasn't yet confirmed the
 * server has this mapping too — the LOCAL row is still immediately usable
 * for resolution regardless (spec §15: "must immediately work locally and
 * offline," not "must wait for sync").
 */
export interface LearnedGtinMapping {
  gtin: string;
  catalogProductId: string;
  evidenceType: "USER_CONFIRMED";
  confirmedAt: string;
  syncedAt: string | null;
}
