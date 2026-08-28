/**
 * Storage-agnostic repository interfaces (ADR-001, ADR-008). The client
 * (Dexie/IndexedDB, `lib/db-client/`) and — for the same entities — a
 * server-side implementation (Drizzle/Postgres, `lib/db/`) both implement
 * these shapes, so application/domain code never depends on which
 * storage engine it's actually talking to. No component or route handler
 * calls Dexie or Drizzle directly for these entities — everything routes
 * through here (ADR-008's "no raw IndexedDB calls scattered through
 * components" rule, applied to Drizzle too for symmetry).
 */
import type { OutboxEntry } from "@/lib/domain/outbox";
import type { PurchaseListRecord, UserPreferencesRecord } from "@/lib/domain/entities";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import type { CatalogProduct } from "@/lib/domain/catalog";
import type { OfflineIndexEntry } from "@/lib/domain/offline-index";
import type { LearnedGtinMapping } from "@/lib/domain/learned-mapping";

export interface OutboxRepository {
  enqueue(entry: OutboxEntry): Promise<void>;
  listPending(now: string): Promise<OutboxEntry[]>;
  markSyncing(clientMutationId: string): Promise<void>;
  markSynced(clientMutationId: string): Promise<void>;
  markFailed(clientMutationId: string, error: string, nextAttemptAt: string): Promise<void>;
  remove(clientMutationId: string): Promise<void>;
  /** Every outbox entry still pending for a given entity (used to compute an entity's displayed sync state — e.g. "does this row have anything still in flight"). */
  listForEntity(entityId: string): Promise<OutboxEntry[]>;
}

export interface UserPreferencesRepository {
  get(accountId: string): Promise<UserPreferencesRecord | null>;
  /** Local edit: writes the record + an outbox entry in one transaction, sets `syncState` to `pending`/`local-only`. */
  update(
    accountId: string,
    patch: Partial<Pick<UserPreferencesRecord, "theme" | "language" | "reminderDefaultSnoozeMinutes" | "accessibilityTextScale">>,
  ): Promise<UserPreferencesRecord>;
  /** Applies a record pulled/acked from the server — never generates a new outbox entry. */
  applyRemote(record: UserPreferencesRecord): Promise<void>;
}

export interface PurchaseListRepository {
  list(profileId: string): Promise<PurchaseListRecord[]>;
  get(id: string): Promise<PurchaseListRecord | null>;
  /** Local create: writes the record + an outbox entry in one transaction. */
  create(input: { id: string; profileId: string; name: string; clientMutationId: string }): Promise<PurchaseListRecord>;
  /** Local edit: bumps the local `version` optimistically and enqueues an outbox entry carrying the version it was BASED ON (`baseVersion`), so the server can detect a real conflict. */
  rename(id: string, name: string, clientMutationId: string): Promise<PurchaseListRecord>;
  /** Applies a record pulled/acked from the server — never generates a new outbox entry. */
  applyRemote(record: PurchaseListRecord): Promise<void>;
  /** Marks the row `conflict` (Phase 1 §5's "surfaced conflict on true divergence") rather than silently overwriting it. */
  markConflict(id: string): Promise<void>;
  /** Marks the row `failed` (never silently disappears — Phase 3 §5). */
  markFailed(id: string): Promise<void>;
}

export interface CreateUserMedicationInput {
  id: string;
  profileId: string;
  clientMutationId: string;
  catalogProductId: string | null;
  customName: string | null;
  customForm: UserMedicationRecord["customForm"];
  customStrengthValue: string | null;
  customStrengthUnit: string | null;
  inventoryUnit: UserMedicationRecord["inventoryUnit"];
  lowStockThresholdValue: string | null;
  expiryWarningDays: number;
  notes: string | null;
}

/**
 * `UserMedication` (Phase 2 §2.5, ADR-004) — the third entity through the
 * outbox/sync pattern (Phase 6), optimistic concurrency like
 * `PurchaseList`, plus the optional `catalogProductId` FK.
 */
export interface UserMedicationRepository {
  list(profileId: string): Promise<UserMedicationRecord[]>;
  get(id: string): Promise<UserMedicationRecord | null>;
  /** Local create: writes the record + an outbox entry in one transaction. */
  create(input: CreateUserMedicationInput): Promise<UserMedicationRecord>;
  /** Applies a record pulled/acked from the server — never generates a new outbox entry. */
  applyRemote(record: UserMedicationRecord): Promise<void>;
  markConflict(id: string): Promise<void>;
  markFailed(id: string): Promise<void>;
}

/**
 * Read-mostly local cache of catalog products the user has actually
 * seen (Phase 1 §7's "local cache first" rule) — never mutated by the
 * user, never goes through the outbox (server-authoritative, Phase 2
 * §2.4).
 */
export interface CatalogCacheRepository {
  get(id: string): Promise<CatalogProduct | null>;
  /** GTIN exact-match against the local cache — the scan flow's local-cache-first lookup (Phase 1 §7) before ever touching the network. `gtin` is expected pre-normalized (14-digit, `lib/domain/gs1.ts`). */
  getByGtin(gtin: string): Promise<CatalogProduct | null>;
  /** EOF code exact-match against the local cache — Path A's local-cache-first lookup (medication-resolution-architecture.md §2.5), the `getByGtin` analogue for `lib/domain/greek-national-barcode.ts`'s decoded 9-digit EOF code. */
  getByEofCode(eofCode: string): Promise<CatalogProduct | null>;
  /** Upserts every result from a completed search/lookup into the cache, so it's available offline afterward. */
  cacheAll(products: readonly CatalogProduct[]): Promise<void>;
}

export interface OfflineIndexLocalManifest {
  version: string;
  recordCount: number;
  generatedAt: string;
  syncedAt: string;
}

/**
 * The full compact offline index (spec §12/§17/§22) — replaces
 * `CatalogCacheRepository`'s "only what's been looked up before" cache
 * behavior with a proactively-synced complete authoritative catalog, so a
 * never-before-scanned-on-this-device product still resolves offline.
 * `replaceAll` is the ONLY write path and must be atomic (spec §18): a
 * failed/interrupted sync must never leave the local index partially
 * overwritten — either the whole replacement lands, or the previous
 * version stays fully intact.
 */
export interface OfflineIndexRepository {
  getManifest(): Promise<OfflineIndexLocalManifest | null>;
  getById(id: string): Promise<OfflineIndexEntry | null>;
  getByEofCode(eofCode: string): Promise<OfflineIndexEntry | null>;
  getByGtin(gtin: string): Promise<OfflineIndexEntry | null>;
  /** Accent/case-insensitive substring search over brand name and active ingredient — the offline analogue of `MedicationCatalogProvider.search` (spec §23: search must use the same local index, never a separate duplicate database). */
  search(query: string, limit?: number): Promise<OfflineIndexEntry[]>;
  /**
   * The full local index, unfiltered — what OCR package-candidate matching
   * (`lib/domain/package-candidate-matching.ts`) scores against
   * (OCR-fallback task spec §7: "must use the existing synced offline
   * catalog," never a second database). Deliberately not query-filtered
   * server-side-`search`-style: `rankPackageCandidates` does its own
   * prefiltering internally from the full OCR text, which is more robust
   * than a single substring query when the OCR brand guess is imperfect or
   * empty. At the measured index size (~9,400 records) reading the whole
   * table is well within the same latency budget `search` already proved
   * out (spec §14).
   */
  getAll(): Promise<readonly OfflineIndexEntry[]>;
  /** Atomically replaces the ENTIRE local index with `entries`, in one transaction, and records `manifest` as the new locally-synced version. Never a partial/incremental write. */
  replaceAll(manifest: OfflineIndexLocalManifest, entries: readonly OfflineIndexEntry[]): Promise<void>;
}

/**
 * Durable local record of a scan that couldn't be identified while
 * offline (Phase 1 §7 / Phase 3 §4's "Add medication (scan, uncached
 * product)" offline behavior) — never synced, no server entity yet (no
 * `Package`/inventory schema exists; `MedicationPackageId` in
 * `lib/domain/ids.ts` is reserved for a future phase). `resolvedAt` is set
 * locally once a later online lookup or the user's own manual entry
 * accounts for it.
 */
export interface UnresolvedScanRecord {
  id: string;
  profileId: string;
  gtin: string;
  rawValue: string;
  format: string;
  parsedExpiry: string | null;
  parsedBatch: string | null;
  parsedSerial: string | null;
  scannedAt: string;
  resolvedAt: string | null;
}

export type SaveUnresolvedScanInput = Omit<UnresolvedScanRecord, "scannedAt" | "resolvedAt">;

export interface UnresolvedScanRepository {
  save(input: SaveUnresolvedScanInput): Promise<void>;
  listPending(profileId: string): Promise<UnresolvedScanRecord[]>;
}

/**
 * Device-local, user-confirmed GTIN mappings (OCR-fallback task spec §12-
 * §16) — the primary, always-offline-available resolution path once a
 * user has confirmed an OCR candidate once (spec §15: "second scan → local
 * exact USER_CONFIRMED mapping → no OCR required"). One row per GTIN per
 * device (`gtin` is the Dexie primary key); `save` on a GTIN that already
 * maps to a DIFFERENT product overwrites the local row (this device only
 * ever remembers its most recent confirmation for a given GTIN) but
 * `save`'s return value reports whether that happened, so the caller can
 * still surface it honestly rather than silently swap the answer — the
 * server side (`confirmIdentifier`) is where a genuine, permanent
 * cross-confirmation CONFLICT record is preserved (spec §19).
 */
export interface LearnedMappingRepository {
  getByGtin(gtin: string): Promise<LearnedGtinMapping | null>;
  /** Returns `{overwroteDifferentProduct: true}` when this GTIN was already locally mapped to a DIFFERENT `catalogProductId` — never silent. */
  save(mapping: LearnedGtinMapping): Promise<{ overwroteDifferentProduct: boolean }>;
  /** Every row not yet confirmed synced server-side (`syncedAt === null`) — the background sync worker's retry queue. */
  listUnsynced(): Promise<LearnedGtinMapping[]>;
  markSynced(gtin: string, syncedAt: string): Promise<void>;
}
