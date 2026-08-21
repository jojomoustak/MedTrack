/**
 * Server-side mutation application (`app/api/sync/mutations` uses this).
 *
 * Idempotency (Phase 2 §5.1): `sync_mutation` is the general-purpose
 * ledger — every mutation is checked against it first; a retried
 * `client_mutation_id` returns the cached outcome rather than
 * re-applying. Per-entity conflict strategy (Phase 2 §5) is applied via
 * a single atomic CTE statement per entity type, so "does this mutation
 * apply" and "record that it applied" can never disagree (no window
 * where the entity changed but the ledger wasn't updated, or vice
 * versa).
 *
 * Two round trips per NEW mutation (both individually atomic via
 * `withProfileScope`'s same-batch guarantee, per ADR-002):
 *   1. Check `sync_mutation` (+ fetch the entity's current row) — if
 *      found, this is a replay; return the cached result without
 *      touching the entity table again.
 *   2. Not found → run the entity-specific CTE that atomically applies
 *      the write (or determines it's a genuine conflict), records the
 *      outcome in `sync_mutation`, and — only when actually applied —
 *      appends to `sync_change_log`.
 * A concurrent duplicate request racing between round trips 1 and 2 is
 * caught via `sync_mutation`'s UNIQUE(client_mutation_id) constraint
 * (23505) and re-resolved as a replay rather than erroring the request.
 */
import { eq, sql } from "drizzle-orm";
import { withProfileScope } from "@/lib/db/rls";
import * as schema from "@/lib/db/schema";
import type { Db, TestableDb } from "@/lib/db/client";
import type { SyncMutationRequest, SyncMutationResult } from "@/lib/sync/protocol";
import { ConflictError, ValidationError } from "@/lib/errors/app-error";
import { logger } from "@/lib/logging/logger";

const POSTGRES_UNIQUE_VIOLATION = "23505";

interface MutationContext {
  profileId: string;
  accountId: string;
  /** Test-only injection point — production callers omit this and get the default `getDb()` (Neon HTTP driver). See `lib/db/rls.ts`'s `options.db`. */
  db?: Db | TestableDb;
}

/** Rejects the whole request outright if this profile has been hard-deleted (Phase 2 §4's DB-checkable "no resurrection via sync" rule). */
export async function assertProfileNotDeleted(profileId: string, db?: Db | TestableDb): Promise<void> {
  const [rows] = await withProfileScope(
    profileId,
    (db) => [
      db
        .select({ profileId: schema.deletedProfileRegistry.profileId })
        .from(schema.deletedProfileRegistry)
        .where(eq(schema.deletedProfileRegistry.profileId, profileId))
        .limit(1),
    ],
    { db },
  );
  if (rows.length > 0) {
    throw new ConflictError("This account has been deleted; sync is no longer accepted.");
  }
}

async function findExistingMutation(
  profileId: string,
  clientMutationId: string,
  db?: Db | TestableDb,
): Promise<{ result: string; responseSnapshot: unknown } | null> {
  const [rows] = await withProfileScope(
    profileId,
    (db) => [
      db
        .select({ result: schema.syncMutation.result, responseSnapshot: schema.syncMutation.responseSnapshot })
        .from(schema.syncMutation)
        .where(eq(schema.syncMutation.clientMutationId, clientMutationId))
        .limit(1),
    ],
    { db },
  );
  return rows[0] ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION;
}

async function applyUserPreferencesMutation(ctx: MutationContext, mutation: SyncMutationRequest): Promise<SyncMutationResult> {
  const payload = mutation.payload as {
    theme?: string;
    language?: string;
    reminderDefaultSnoozeMinutes?: number;
    accessibilityTextScale?: string;
    clientUpdatedAt?: string;
  };

  const theme = payload.theme ?? "system";
  const language = payload.language ?? "el";
  const snooze = payload.reminderDefaultSnoozeMinutes ?? 10;
  const scale = payload.accessibilityTextScale ?? "1.00";
  const clientUpdatedAt = payload.clientUpdatedAt ?? new Date().toISOString();

  const [rows] = await withProfileScope(
    ctx.profileId,
    (db) => [
      db.execute(sql`
        WITH upserted AS (
          INSERT INTO user_preferences (account_id, theme, language, reminder_default_snooze_minutes, accessibility_text_scale, updated_at, client_updated_at)
          VALUES (${ctx.accountId}::uuid, ${theme}, ${language}, ${snooze}, ${scale}::numeric, now(), ${clientUpdatedAt}::timestamptz)
          ON CONFLICT (account_id) DO UPDATE SET
            theme = excluded.theme,
            language = excluded.language,
            reminder_default_snooze_minutes = excluded.reminder_default_snooze_minutes,
            accessibility_text_scale = excluded.accessibility_text_scale,
            updated_at = now(),
            client_updated_at = excluded.client_updated_at
          WHERE user_preferences.client_updated_at IS NULL OR excluded.client_updated_at >= user_preferences.client_updated_at
          RETURNING *
        ),
        current_row AS (
          SELECT * FROM upserted
          UNION ALL
          SELECT * FROM user_preferences WHERE account_id = ${ctx.accountId}::uuid AND NOT EXISTS (SELECT 1 FROM upserted)
        ),
        recorded AS (
          INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
          SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'userPreferences', ${ctx.accountId}::uuid, 'applied', to_jsonb(current_row.*)
          FROM current_row
          RETURNING *
        ),
        logged AS (
          INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, occurred_at)
          SELECT ${ctx.profileId}::uuid, 'userPreferences', ${ctx.accountId}::uuid, 'update', now()
          FROM upserted
          RETURNING 1
        )
        SELECT current_row.* FROM current_row;
      `),
    ],
    { accountId: ctx.accountId, db: ctx.db },
  );

  const record = (rows as { rows?: Record<string, unknown>[] }).rows?.[0];
  return { clientMutationId: mutation.clientMutationId, result: "applied", serverRecord: record };
}

async function applyPurchaseListMutation(ctx: MutationContext, mutation: SyncMutationRequest): Promise<SyncMutationResult> {
  const payload = mutation.payload as { name?: string };
  const name = payload.name;
  if (!name || typeof name !== "string") {
    throw new ValidationError("purchaseList mutation payload requires a non-empty `name`.");
  }

  if (mutation.operation === "create") {
    const [rows] = await withProfileScope(
      ctx.profileId,
      (db) => [
        db.execute(sql`
        WITH inserted AS (
          INSERT INTO purchase_list (id, profile_id, name, is_archived, created_at, updated_at, version, client_mutation_id)
          VALUES (${mutation.entityId}::uuid, ${ctx.profileId}::uuid, ${name}, false, now(), now(), 1, ${mutation.clientMutationId}::uuid)
          ON CONFLICT (id) DO NOTHING
          RETURNING *
        ),
        current_row AS (
          SELECT * FROM inserted
          UNION ALL
          SELECT * FROM purchase_list WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM inserted)
        ),
        recorded AS (
          INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
          SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'purchaseList', ${mutation.entityId}::uuid, 'applied', to_jsonb(current_row.*)
          FROM current_row
          RETURNING *
        ),
        logged AS (
          INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, server_version, occurred_at)
          SELECT profile_id, 'purchaseList', id, 'create', version, now() FROM inserted
          RETURNING 1
        )
        SELECT current_row.* FROM current_row;
      `),
      ],
      { db: ctx.db },
    );
    const record = (rows as { rows?: Record<string, unknown>[] }).rows?.[0];
    return { clientMutationId: mutation.clientMutationId, result: "applied", serverRecord: record };
  }

  // update — the real optimistic-concurrency path (Phase 2 §5).
  if (mutation.baseVersion === undefined) {
    throw new ValidationError("purchaseList update mutations require `baseVersion`.");
  }

  const [rows] = await withProfileScope(
    ctx.profileId,
    (db) => [
    db.execute(sql`
      WITH updated AS (
        UPDATE purchase_list
        SET name = ${name}, version = version + 1, updated_at = now(), client_mutation_id = ${mutation.clientMutationId}::uuid
        WHERE id = ${mutation.entityId}::uuid AND version = ${mutation.baseVersion} AND deleted_at IS NULL
        RETURNING *
      ),
      current_row AS (
        SELECT * FROM updated
        UNION ALL
        SELECT * FROM purchase_list WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM updated)
      ),
      recorded AS (
        INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
        SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'purchaseList', ${mutation.entityId}::uuid,
          CASE WHEN EXISTS (SELECT 1 FROM updated) THEN 'applied' ELSE 'conflict' END,
          to_jsonb(current_row.*)
        FROM current_row
        RETURNING result
      ),
      logged AS (
        INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, server_version, occurred_at)
        SELECT profile_id, 'purchaseList', id, 'update', version, now() FROM updated
        RETURNING 1
      )
      SELECT current_row.*, recorded.result AS mutation_result FROM current_row, recorded;
    `),
    ],
    { db: ctx.db },
  );

  const record = (rows as { rows?: Record<string, unknown>[] }).rows?.[0];
  const outcome = (record?.mutation_result as string | undefined) === "applied" ? "applied" : "conflict";
  if (record) delete record.mutation_result;
  return { clientMutationId: mutation.clientMutationId, result: outcome, serverRecord: record };
}

async function applyUserMedicationMutation(ctx: MutationContext, mutation: SyncMutationRequest): Promise<SyncMutationResult> {
  if (mutation.operation === "create") {
    const payload = mutation.payload as {
      catalogProductId?: string | null;
      customName?: string | null;
      customForm?: string | null;
      customStrengthValue?: string | null;
      customStrengthUnit?: string | null;
      treatmentState?: string;
      inventoryUnit?: string;
      lowStockThresholdValue?: string | null;
      expiryWarningDays?: number;
      notes?: string | null;
    };

    if (!payload.catalogProductId && !payload.customName) {
      // Mirrors chk_catalog_or_manual (ADR-004) — defense-in-depth on top
      // of the client-side Zod schema (lib/validation/user-medication.ts)
      // and the DB CHECK constraint itself.
      throw new ValidationError("A user medication needs either a catalog match or a manual name.");
    }
    if (!payload.inventoryUnit) {
      throw new ValidationError("inventoryUnit is required.");
    }

    try {
      const [rows] = await withProfileScope(
        ctx.profileId,
        (db) => [
          db.execute(sql`
          WITH inserted AS (
            INSERT INTO user_medication (
              id, profile_id, catalog_product_id, custom_name, custom_form,
              custom_strength_value, custom_strength_unit, treatment_state,
              inventory_unit, low_stock_threshold_value, expiry_warning_days,
              notes, created_at, updated_at, version, client_mutation_id
            )
            VALUES (
              ${mutation.entityId}::uuid, ${ctx.profileId}::uuid, ${payload.catalogProductId ?? null}::uuid,
              ${payload.customName ?? null}, ${payload.customForm ?? null},
              ${payload.customStrengthValue ?? null}::numeric, ${payload.customStrengthUnit ?? null},
              ${payload.treatmentState ?? "active"}, ${payload.inventoryUnit},
              ${payload.lowStockThresholdValue ?? null}::numeric, ${payload.expiryWarningDays ?? 30},
              ${payload.notes ?? null}, now(), now(), 1, ${mutation.clientMutationId}::uuid
            )
            ON CONFLICT (id) DO NOTHING
            RETURNING *
          ),
          current_row AS (
            SELECT * FROM inserted
            UNION ALL
            SELECT * FROM user_medication WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM inserted)
          ),
          recorded AS (
            INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
            SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'userMedication', ${mutation.entityId}::uuid, 'applied', to_jsonb(current_row.*)
            FROM current_row
            RETURNING *
          ),
          logged AS (
            INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, server_version, occurred_at)
            SELECT profile_id, 'userMedication', id, 'create', version, now() FROM inserted
            RETURNING 1
          )
          SELECT current_row.* FROM current_row;
        `),
        ],
        { db: ctx.db },
      );
      const record = (rows as { rows?: Record<string, unknown>[] }).rows?.[0];
      return { clientMutationId: mutation.clientMutationId, result: "applied", serverRecord: record };
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ValidationError("catalogProductId does not reference a known catalog product.");
      }
      throw err;
    }
  }

  // update — optimistic concurrency, limited to the fields users can
  // actually edit post-creation at this phase (treatment state, notes,
  // low-stock threshold) — full editing is a later-phase concern.
  const payload = mutation.payload as {
    treatmentState?: string;
    notes?: string | null;
    lowStockThresholdValue?: string | null;
  };
  if (mutation.baseVersion === undefined) {
    throw new ValidationError("userMedication update mutations require `baseVersion`.");
  }

  const [rows] = await withProfileScope(
    ctx.profileId,
    (db) => [
      db.execute(sql`
      WITH updated AS (
        UPDATE user_medication
        SET treatment_state = COALESCE(${payload.treatmentState ?? null}, treatment_state),
            notes = ${payload.notes ?? null},
            low_stock_threshold_value = ${payload.lowStockThresholdValue ?? null}::numeric,
            version = version + 1,
            updated_at = now(),
            client_mutation_id = ${mutation.clientMutationId}::uuid
        WHERE id = ${mutation.entityId}::uuid AND version = ${mutation.baseVersion} AND deleted_at IS NULL
        RETURNING *
      ),
      current_row AS (
        SELECT * FROM updated
        UNION ALL
        SELECT * FROM user_medication WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM updated)
      ),
      recorded AS (
        INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
        SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'userMedication', ${mutation.entityId}::uuid,
          CASE WHEN EXISTS (SELECT 1 FROM updated) THEN 'applied' ELSE 'conflict' END,
          to_jsonb(current_row.*)
        FROM current_row
        RETURNING result
      ),
      logged AS (
        INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, server_version, occurred_at)
        SELECT profile_id, 'userMedication', id, 'update', version, now() FROM updated
        RETURNING 1
      )
      SELECT current_row.*, recorded.result AS mutation_result FROM current_row, recorded;
    `),
    ],
    { db: ctx.db },
  );

  const record = (rows as { rows?: Record<string, unknown>[] }).rows?.[0];
  const outcome = (record?.mutation_result as string | undefined) === "applied" ? "applied" : "conflict";
  if (record) delete record.mutation_result;
  return { clientMutationId: mutation.clientMutationId, result: outcome, serverRecord: record };
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "23503";
}

async function dispatchMutation(ctx: MutationContext, mutation: SyncMutationRequest): Promise<SyncMutationResult> {
  switch (mutation.entityType) {
    case "userPreferences":
      return applyUserPreferencesMutation(ctx, mutation);
    case "purchaseList":
      return applyPurchaseListMutation(ctx, mutation);
    case "userMedication":
      return applyUserMedicationMutation(ctx, mutation);
    default:
      // Every other Phase 2 entity type is a real, named type (so the
      // outbox/client code stays honest about what exists) but has no
      // server-side handler yet — Phase 6 wires these up per entity as
      // real CRUD lands, per this phase's proof-of-concept scope.
      throw new ValidationError(`No sync handler implemented yet for entity type "${mutation.entityType}".`);
  }
}

/** Applies one mutation, handling the replay-check round trip and the concurrent-duplicate-request race. */
export async function applyOneMutation(ctx: MutationContext, mutation: SyncMutationRequest): Promise<SyncMutationResult> {
  const existing = await findExistingMutation(ctx.profileId, mutation.clientMutationId, ctx.db);
  if (existing) {
    logger.debug("sync.mutation.replay", { entityType: mutation.entityType, result: existing.result });
    return {
      clientMutationId: mutation.clientMutationId,
      result: existing.result as SyncMutationResult["result"],
      serverRecord: (existing.responseSnapshot as Record<string, unknown> | null) ?? undefined,
    };
  }

  try {
    return await dispatchMutation(ctx, mutation);
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Lost a race against a concurrent identical retry — the other
      // request's write already landed; resolve this one as a replay.
      const nowExisting = await findExistingMutation(ctx.profileId, mutation.clientMutationId, ctx.db);
      if (nowExisting) {
        return {
          clientMutationId: mutation.clientMutationId,
          result: nowExisting.result as SyncMutationResult["result"],
          serverRecord: (nowExisting.responseSnapshot as Record<string, unknown> | null) ?? undefined,
        };
      }
    }
    throw err;
  }
}

export async function applyMutations(
  ctx: MutationContext,
  mutations: readonly SyncMutationRequest[],
): Promise<SyncMutationResult[]> {
  await assertProfileNotDeleted(ctx.profileId, ctx.db);

  const results: SyncMutationResult[] = [];
  for (const mutation of mutations) {
    results.push(await applyOneMutation(ctx, mutation));
  }
  return results;
}

/** Exposed for tests that want to build their own `Db` handle. */
export type { Db };
