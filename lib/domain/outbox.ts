/**
 * The durable local outbox (`designing-offline-sync`, Phase 1 §5,
 * ADR-007): every local mutation writes its entity change AND an outbox
 * entry in the same local transaction, so a mutation can never exist
 * without something that will eventually replay it to the server.
 *
 * `OutboxEntry` is storage-agnostic domain shape — the Dexie table in
 * `lib/db-client/dexie.ts` stores exactly this shape; nothing outside the
 * repository layer should touch IndexedDB directly (ADR-008).
 */
import type { SyncEntityType } from "@/lib/domain/sync";

export type OutboxOperation = "create" | "update" | "delete";

/** Outbox-entry-level status — distinct from the entity's own `SyncState` (Phase 1 §5): this tracks the delivery attempt, the entity's `syncState` is what the UI shows. */
export type OutboxStatus = "pending" | "syncing" | "failed";

export interface OutboxEntry<TPayload = Record<string, unknown>> {
  /** The idempotency key — matches `sync_mutation.client_mutation_id` server-side (Phase 2 §5.1). Client-generated, stable for this one mutation attempt. */
  clientMutationId: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: OutboxOperation;
  /** Full record snapshot (not a diff) — simplest to replay correctly and matches how the server upserts. */
  payload: TPayload;
  /** For optimistic-concurrency entities (Phase 2 §5): the version this mutation was built against, so the server can detect a real conflict. Undefined for LWW/ledger/idempotent-by-id entities. */
  baseVersion?: number;
  /** Device clock at the moment of the local write — used for LWW comparison (Phase 2 §2.3/§2.10). Never authoritative on the server (that's `sync_change_log.occurred_at`, server-set). Deliberately NOT the send-ordering key (see `seq`) — a wall-clock string only has millisecond resolution, too coarse for a burst of same-tick writes (e.g. a schedule immediately followed by several generated dose events). */
  createdAt: string;
  /**
   * Local send-ordering key (`nextOutboxSeq()`) — strictly increasing even
   * for multiple entries enqueued within the same millisecond, unlike
   * `createdAt`. A real bug found via live-device testing (2026-08-30,
   * Phase 10, after `listPending`'s `createdAt`-sort fix landed):
   * `AddMedicationFlow` creates a `UserMedication`, then a
   * `MedicationSchedule`, then several generated `DoseEvent`s in quick
   * synchronous succession — easily within the same millisecond on a real
   * device — so a `createdAt` string sort still degraded to Dexie's
   * primary-key (random UUID) iteration order on those ties, reproducing
   * the exact same intra-batch ordering bug the `createdAt` sort was
   * meant to fix. Optional (existing installs' already-stored `failed`
   * outbox entries predate this field) — `listPending` treats a missing
   * `seq` as "send first," which is safe since such entries are already
   * in-flight/transient.
   */
  seq?: number;
  status: OutboxStatus;
  attempts: number;
  /** Backoff scheduling — the worker skips entries whose `nextAttemptAt` is in the future. */
  nextAttemptAt: string;
  lastError?: string;
  /** When this entry last went in flight (`markSyncing`) — see `isOutboxEntryDue`. Missing on entries marked `syncing` before this field existed. */
  syncingSince?: string;
  /**
   * The profile this change belongs to — stamped on every outbox write (see
   * `dexie.ts`'s outbox `creating` hook). Sign-out keeps unsent entries so
   * nothing is lost, so the queue can hold a previous user's changes; only
   * the signed-in profile's entries are ever sent. Missing on entries
   * written before this field existed — see `outboxEntryProfileId`.
   */
  profileId?: string;
}

/** The profile an entry belongs to: its stamp, else the `profileId` in its record snapshot (pre-stamp entries). Undefined when neither says. */
export function outboxEntryProfileId(entry: Pick<OutboxEntry, "profileId" | "payload">): string | undefined {
  if (entry.profileId) return entry.profileId;
  const fromPayload = (entry.payload as { profileId?: unknown } | null)?.profileId;
  return typeof fromPayload === "string" ? fromPayload : undefined;
}

/**
 * Which queued entries to send next, in send order:
 * - only `profileId`'s entries — never another profile's (an entry whose
 *   owner can't be determined is held, not guessed);
 * - each due per `isOutboxEntryDue`;
 * - none for an entity that still has a live (unexpired) in-flight entry,
 *   so a newer change can't overtake an older one still being delivered;
 * - ordered by `seq`, then `createdAt`.
 */
export function selectDueOutboxEntries(entries: OutboxEntry[], now: string, profileId: string): OutboxEntry[] {
  const own = entries.filter((e) => outboxEntryProfileId(e) === profileId);
  const blockedEntities = new Set(own.filter((e) => e.status === "syncing" && !isOutboxEntryDue(e, now)).map((e) => e.entityId));
  return own
    .filter((e) => !blockedEntities.has(e.entityId) && isOutboxEntryDue(e, now))
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

/**
 * How long an entry may sit in `syncing` before it's treated as abandoned.
 * Only the request's own success/failure handlers ever move an entry out
 * of `syncing`, so if the app is killed mid-request (Android reclaiming a
 * backgrounded WebView, the user swiping the app away, a reload) the
 * entry would otherwise stay `syncing` forever and its change would never
 * reach the server. Well above any normal request round-trip; re-sending
 * one that did in fact land is safe, because the server deduplicates on
 * `clientMutationId` and returns the stored result.
 */
export const SYNCING_LEASE_MS = 2 * 60_000;

/**
 * Whether an outbox entry should be included in the next send: `pending`/
 * `failed` once its backoff has elapsed, or `syncing` once its lease has
 * expired (an abandoned in-flight attempt). A `syncing` entry with no
 * `syncingSince` predates the lease and is always stranded, so it's due.
 */
export function isOutboxEntryDue(entry: Pick<OutboxEntry, "status" | "nextAttemptAt" | "syncingSince">, now: string): boolean {
  if (entry.status !== "syncing") return entry.nextAttemptAt <= now;
  if (!entry.syncingSince) return true;
  return new Date(entry.syncingSince).getTime() + SYNCING_LEASE_MS <= new Date(now).getTime();
}

let lastOutboxSeq = 0;

/** Strictly increasing across calls, even within the same millisecond — see `OutboxEntry.seq`'s doc for why `createdAt` alone isn't enough. */
export function nextOutboxSeq(): number {
  const now = Date.now();
  lastOutboxSeq = now > lastOutboxSeq ? now : lastOutboxSeq + 1;
  return lastOutboxSeq;
}

/** Exponential backoff with a cap, plus jitter to avoid a thundering herd of retries all firing at once after a reconnect. */
export function computeNextAttemptDelayMs(attempts: number): number {
  const BASE_MS = 2000;
  const MAX_MS = 5 * 60 * 1000; // 5 minutes
  const exponential = Math.min(BASE_MS * 2 ** attempts, MAX_MS);
  const jitter = Math.random() * 0.3 * exponential;
  return Math.round(exponential + jitter);
}
