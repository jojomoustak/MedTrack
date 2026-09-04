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
import { ConflictError, ValidationError, toAppError } from "@/lib/errors/app-error";
import { deriveTimeAnchor, type ScheduleKind } from "@/lib/domain/medication-schedule";
import { toCamelCaseRecord } from "@/lib/sync/server/snake-case";
import { logger } from "@/lib/logging/logger";

const POSTGRES_UNIQUE_VIOLATION = "23505";
const POSTGRES_FOREIGN_KEY_VIOLATION = "23503";

/**
 * Real Postgres error code, walking the `.cause` chain — a bug found via
 * live Postgres integration testing (2026-09-04, Phase 9): drizzle-orm's
 * node-postgres driver (the `TestableDb` path every integration test
 * uses) wraps the actual `pg` error inside `err.cause` rather than
 * exposing `code` on the thrown error directly, so every
 * `isUniqueViolation`/`isForeignKeyViolation` check in this file had
 * silently never matched against that driver — any handler's "recover
 * from a genuine constraint collision" branch (e.g.
 * `applyDoseEventMutation`'s `uq_dose_event_schedule_instance` recovery,
 * `applyInventoryTransactionMutation`'s `uq_inventory_txn_dose_taken_once`
 * recovery) fell straight through to the generic `INTERNAL_ERROR` path
 * instead, for every environment using this driver. Bounded depth (5) as
 * a defensive backstop against a pathological circular `.cause` chain,
 * not because a real chain is ever expected to be that deep.
 */
function postgresErrorCode(err: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof err !== "object" || err === null) return undefined;
  if ("code" in err && typeof (err as { code?: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  if ("cause" in err) {
    return postgresErrorCode((err as { cause?: unknown }).cause, depth + 1);
  }
  return undefined;
}

/**
 * Builds a `time[]` SQL fragment from a JS string array — NEVER a bare
 * `${array}::time[]` interpolation. Found via a real Postgres integration
 * test run (2026-08-30): drizzle's `sql` template does not serialize a
 * plain JS array into Postgres array-literal syntax against the `pg`
 * driver (the exact same class of bug this project's own stabilization
 * pass already found once, in a test's `= ANY(${array})` cleanup code —
 * see `lib/sync/server/changes.ts`'s `sql.join` doc comment for the
 * other instance). `ARRAY[...]` with individually-bound elements sidesteps
 * whatever the array serialization gap is entirely.
 */
function timeArraySql(times: string[] | null | undefined) {
  if (!times || times.length === 0) return sql`NULL::time[]`;
  return sql`ARRAY[${sql.join(
    times.map((t) => sql`${t}::time`),
    sql`, `,
  )}]`;
}

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
  return postgresErrorCode(err) === POSTGRES_UNIQUE_VIOLATION;
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

/**
 * `MedicationSchedule` (Phase 2 §2.6, Phase 10) — optimistic concurrency.
 * The wall-clock/elapsed subtype split is real schema, but the wire
 * payload is flattened (data-architect design, 2026-08-30): one round
 * trip, and `timeAnchor` is always DERIVED from `scheduleKind` server-side
 * (`deriveTimeAnchor`), never taken from the client — a mismatched pair
 * literally can't be constructed this way, `chk_anchor_matches_kind` and
 * the R15 deferred trigger (`0001_rls_policies_and_schedule_trigger.sql`)
 * are the DB-level backstop, not the primary defense. `scheduleKind` is
 * immutable post-creation — an update mutation never carries it.
 */
async function applyMedicationScheduleMutation(ctx: MutationContext, mutation: SyncMutationRequest): Promise<SyncMutationResult> {
  if (mutation.operation === "delete") {
    if (mutation.baseVersion === undefined) {
      throw new ValidationError("medicationSchedule delete mutations require `baseVersion`.");
    }
    const [rows] = await withProfileScope(
      ctx.profileId,
      (db) => [
        db.execute(sql`
        WITH updated AS (
          UPDATE medication_schedule
          SET deleted_at = now(), version = version + 1, updated_at = now(), client_mutation_id = ${mutation.clientMutationId}::uuid
          WHERE id = ${mutation.entityId}::uuid AND version = ${mutation.baseVersion} AND deleted_at IS NULL
          RETURNING *
        ),
        current_parent AS (
          SELECT * FROM updated
          UNION ALL
          SELECT * FROM medication_schedule WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM updated)
        ),
        current_row AS (
          SELECT cp.*, wc.times_of_day, wc.weekdays_mask, el.interval_hours, el.anchor_at
          FROM current_parent cp
          LEFT JOIN medication_schedule_wall_clock wc ON wc.schedule_id = cp.id
          LEFT JOIN medication_schedule_elapsed el ON el.schedule_id = cp.id
        ),
        recorded AS (
          INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
          SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'medicationSchedule', ${mutation.entityId}::uuid,
            CASE WHEN EXISTS (SELECT 1 FROM updated) THEN 'applied' ELSE 'conflict' END,
            to_jsonb(current_row.*)
          FROM current_row
          RETURNING result
        ),
        logged AS (
          INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, server_version, occurred_at)
          SELECT profile_id, 'medicationSchedule', id, 'delete', version, now() FROM updated
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

  const payload = mutation.payload as {
    userMedicationId?: string;
    scheduleKind?: string;
    startDate?: string;
    endDate?: string | null;
    timezone?: string;
    doseQuantityValue?: string;
    doseQuantityUnit?: string;
    timesOfDay?: string[] | null;
    weekdaysMask?: number | null;
    intervalHours?: number | null;
    anchorAt?: string | null;
  };

  if (mutation.operation === "create") {
    if (
      !payload.userMedicationId ||
      !payload.scheduleKind ||
      !payload.startDate ||
      !payload.timezone ||
      !payload.doseQuantityValue ||
      !payload.doseQuantityUnit
    ) {
      throw new ValidationError("medicationSchedule create mutation payload is missing required fields.");
    }
    const timeAnchor = deriveTimeAnchor(payload.scheduleKind as ScheduleKind);

    try {
      const [rows] = await withProfileScope(
        ctx.profileId,
        (db) => [
          db.execute(sql`
          WITH inserted AS (
            INSERT INTO medication_schedule (
              id, profile_id, user_medication_id, schedule_kind, time_anchor,
              start_date, end_date, timezone, dose_quantity_value, dose_quantity_unit,
              created_at, updated_at, version, client_mutation_id
            )
            VALUES (
              ${mutation.entityId}::uuid, ${ctx.profileId}::uuid, ${payload.userMedicationId}::uuid, ${payload.scheduleKind}, ${timeAnchor},
              ${payload.startDate}::date, ${payload.endDate ?? null}::date, ${payload.timezone}, ${payload.doseQuantityValue}::numeric, ${payload.doseQuantityUnit},
              now(), now(), 1, ${mutation.clientMutationId}::uuid
            )
            ON CONFLICT (id) DO NOTHING
            RETURNING *
          ),
          inserted_wall_clock AS (
            INSERT INTO medication_schedule_wall_clock (schedule_id, times_of_day, weekdays_mask)
            SELECT id, ${timeArraySql(payload.timesOfDay)}, ${payload.weekdaysMask ?? null}
            FROM inserted WHERE time_anchor = 'wall_clock'
            RETURNING *
          ),
          inserted_elapsed AS (
            INSERT INTO medication_schedule_elapsed (schedule_id, interval_hours, anchor_at)
            SELECT id, ${payload.intervalHours ?? null}, ${payload.anchorAt ?? null}::timestamptz
            FROM inserted WHERE time_anchor = 'elapsed'
            RETURNING *
          ),
          current_parent AS (
            SELECT * FROM inserted
            UNION ALL
            SELECT * FROM medication_schedule WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM inserted)
          ),
          -- A plain FROM/JOIN against the base subtype tables here would
          -- NOT see inserted_wall_clock/inserted_elapsed's own writes --
          -- within one statement, Postgres CTEs all read from the SAME
          -- pre-statement snapshot unless a later part references a
          -- data-modifying CTE BY NAME (PostgreSQL docs, "Data-Modifying
          -- Statements in WITH": sub-statements "cannot see one another's
          -- effects on the target tables"). Found via a real Postgres
          -- integration test run (2026-08-30) -- times_of_day/
          -- interval_hours came back null on a freshly-inserted row even
          -- though the subtype INSERT itself succeeded. UNION against the
          -- inserted_*/updated_* CTE's own output (fresh-write case) with
          -- the base-table read as the fallback (replay/unchanged case,
          -- where the old snapshot IS correct since nothing wrote to it
          -- this statement) mirrors current_parent's own pattern above.
          current_wall_clock AS (
            SELECT * FROM inserted_wall_clock
            UNION ALL
            SELECT * FROM medication_schedule_wall_clock WHERE schedule_id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM inserted_wall_clock)
          ),
          current_elapsed AS (
            SELECT * FROM inserted_elapsed
            UNION ALL
            SELECT * FROM medication_schedule_elapsed WHERE schedule_id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM inserted_elapsed)
          ),
          current_row AS (
            SELECT cp.*, wc.times_of_day, wc.weekdays_mask, el.interval_hours, el.anchor_at
            FROM current_parent cp
            LEFT JOIN current_wall_clock wc ON wc.schedule_id = cp.id
            LEFT JOIN current_elapsed el ON el.schedule_id = cp.id
          ),
          recorded AS (
            INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
            SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'medicationSchedule', ${mutation.entityId}::uuid, 'applied', to_jsonb(current_row.*)
            FROM current_row
            RETURNING *
          ),
          logged AS (
            INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, server_version, occurred_at)
            SELECT profile_id, 'medicationSchedule', id, 'create', version, now() FROM inserted
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
        throw new ValidationError("userMedicationId does not reference a known medication.");
      }
      throw err;
    }
  }

  // update — scheduleKind (and timeAnchor) is immutable; only the
  // date/timezone/quantity/recurrence-detail fields can change. Each
  // "provided vs. absent" distinction below matters for the two
  // genuinely-nullable fields (endDate, weekdaysMask): a plain COALESCE
  // can't tell "not sent, keep existing" apart from "sent as null, clear
  // it", so those two use an explicit CASE on whether the key was present
  // in the JSON payload at all (a JS `undefined` never serializes as a
  // JSON key, so this is a reliable signal from the client's `Partial<>`
  // patch shape).
  if (mutation.baseVersion === undefined) {
    throw new ValidationError("medicationSchedule update mutations require `baseVersion`.");
  }

  const [rows] = await withProfileScope(
    ctx.profileId,
    (db) => [
      db.execute(sql`
      WITH updated AS (
        UPDATE medication_schedule
        SET start_date = COALESCE(${payload.startDate ?? null}::date, start_date),
            end_date = CASE WHEN ${payload.endDate !== undefined} THEN ${payload.endDate ?? null}::date ELSE end_date END,
            timezone = COALESCE(${payload.timezone ?? null}, timezone),
            dose_quantity_value = COALESCE(${payload.doseQuantityValue ?? null}::numeric, dose_quantity_value),
            dose_quantity_unit = COALESCE(${payload.doseQuantityUnit ?? null}, dose_quantity_unit),
            version = version + 1, updated_at = now(), client_mutation_id = ${mutation.clientMutationId}::uuid
        WHERE id = ${mutation.entityId}::uuid AND version = ${mutation.baseVersion} AND deleted_at IS NULL
        RETURNING *
      ),
      updated_wall_clock AS (
        UPDATE medication_schedule_wall_clock
        SET times_of_day = COALESCE(${timeArraySql(payload.timesOfDay)}, times_of_day),
            weekdays_mask = CASE WHEN ${payload.weekdaysMask !== undefined} THEN ${payload.weekdaysMask ?? null} ELSE weekdays_mask END
        WHERE schedule_id IN (SELECT id FROM updated WHERE time_anchor = 'wall_clock')
        RETURNING *
      ),
      updated_elapsed AS (
        UPDATE medication_schedule_elapsed
        SET interval_hours = COALESCE(${payload.intervalHours ?? null}, interval_hours),
            anchor_at = COALESCE(${payload.anchorAt ?? null}::timestamptz, anchor_at)
        WHERE schedule_id IN (SELECT id FROM updated WHERE time_anchor = 'elapsed')
        RETURNING *
      ),
      current_parent AS (
        SELECT * FROM updated
        UNION ALL
        SELECT * FROM medication_schedule WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM updated)
      ),
      -- Same reasoning as the create-path's current_wall_clock/
      -- current_elapsed doc comment: a plain read against the base
      -- subtype tables here wouldn't see updated_wall_clock/
      -- updated_elapsed's own writes within this same statement.
      current_wall_clock AS (
        SELECT * FROM updated_wall_clock
        UNION ALL
        SELECT * FROM medication_schedule_wall_clock WHERE schedule_id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM updated_wall_clock)
      ),
      current_elapsed AS (
        SELECT * FROM updated_elapsed
        UNION ALL
        SELECT * FROM medication_schedule_elapsed WHERE schedule_id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM updated_elapsed)
      ),
      current_row AS (
        SELECT cp.*, wc.times_of_day, wc.weekdays_mask, el.interval_hours, el.anchor_at
        FROM current_parent cp
        LEFT JOIN current_wall_clock wc ON wc.schedule_id = cp.id
        LEFT JOIN current_elapsed el ON el.schedule_id = cp.id
      ),
      recorded AS (
        INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
        SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'medicationSchedule', ${mutation.entityId}::uuid,
          CASE WHEN EXISTS (SELECT 1 FROM updated) THEN 'applied' ELSE 'conflict' END,
          to_jsonb(current_row.*)
        FROM current_row
        RETURNING result
      ),
      logged AS (
        INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, server_version, occurred_at)
        SELECT profile_id, 'medicationSchedule', id, 'update', version, now() FROM updated
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

/**
 * `DoseEvent` (Phase 2 §2.7, Phase 10) — idempotent-by-id, never
 * optimistic concurrency (`designing-offline-sync`: "rely on stable IDs +
 * idempotent writes rather than 'who won'"). No `baseVersion`, and this
 * function NEVER returns `"conflict"` — a create collides harmlessly via
 * `ON CONFLICT (id) DO NOTHING`, and an update to an already-terminal row
 * is a silent no-op that still returns `'applied'` with the current
 * authoritative row.
 */
async function applyDoseEventMutation(ctx: MutationContext, mutation: SyncMutationRequest): Promise<SyncMutationResult> {
  if (mutation.operation === "create") {
    const payload = mutation.payload as {
      userMedicationId?: string;
      scheduleId?: string | null;
      scheduledAt?: string | null;
      reminderAt?: string | null;
      quantityValue?: string | null;
      quantityUnit?: string | null;
      source?: string;
    };
    if (!payload.userMedicationId || !payload.source) {
      throw new ValidationError("doseEvent create mutation payload is missing required fields.");
    }

    try {
      const [rows] = await withProfileScope(
        ctx.profileId,
        (db) => [
          db.execute(sql`
          WITH inserted AS (
            INSERT INTO dose_event (
              id, profile_id, user_medication_id, schedule_id, scheduled_at, reminder_at,
              status, quantity_value, quantity_unit, source, snooze_count,
              created_at, updated_at, client_mutation_id
            )
            VALUES (
              ${mutation.entityId}::uuid, ${ctx.profileId}::uuid, ${payload.userMedicationId}::uuid, ${payload.scheduleId ?? null}::uuid,
              ${payload.scheduledAt ?? null}::timestamptz, ${payload.reminderAt ?? null}::timestamptz,
              'scheduled', ${payload.quantityValue ?? null}::numeric, ${payload.quantityUnit ?? null}, ${payload.source}, 0,
              now(), now(), ${mutation.clientMutationId}::uuid
            )
            ON CONFLICT (id) DO NOTHING
            RETURNING *
          ),
          current_row AS (
            SELECT * FROM inserted
            UNION ALL
            SELECT * FROM dose_event WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM inserted)
          ),
          recorded AS (
            INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
            SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'doseEvent', ${mutation.entityId}::uuid, 'applied', to_jsonb(current_row.*)
            FROM current_row
            RETURNING *
          ),
          logged AS (
            INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, occurred_at)
            SELECT profile_id, 'doseEvent', id, 'create', now() FROM inserted
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
        throw new ValidationError("userMedicationId or scheduleId does not reference a known record.");
      }
      if (isUniqueViolation(err)) {
        // uq_dose_event_schedule_instance -- a genuine collision on
        // (user_medication_id, schedule_id, scheduled_at) but a DIFFERENT
        // id (the expected deterministic-id-collision path is already
        // handled by ON CONFLICT (id) above without ever reaching this
        // catch). Recover by returning the row that's actually there
        // rather than erroring the whole request.
        const [existingRows] = await withProfileScope(
          ctx.profileId,
          (db) => [
            db.execute(sql`
              SELECT * FROM dose_event
              WHERE user_medication_id = ${payload.userMedicationId}::uuid
                AND schedule_id = ${payload.scheduleId ?? null}::uuid
                AND scheduled_at = ${payload.scheduledAt ?? null}::timestamptz
              LIMIT 1
            `),
          ],
          { db: ctx.db },
        );
        const record = (existingRows as { rows?: Record<string, unknown>[] }).rows?.[0];
        if (record) {
          return { clientMutationId: mutation.clientMutationId, result: "applied", serverRecord: record };
        }
      }
      throw err;
    }
  }

  // update — a status transition (Taken/Skip/Snooze/etc, Phase 3 §2.2's
  // dose action sheet). Only applies if the row's CURRENT stored status
  // is non-terminal; the literal status list below must stay in sync
  // with TERMINAL_DOSE_EVENT_STATUSES (lib/domain/dose-event.ts).
  const payload = mutation.payload as {
    status?: string;
    takenAt?: string;
    quantityValue?: string;
    quantityUnit?: string;
    reminderAt?: string;
  };
  if (!payload.status) {
    throw new ValidationError("doseEvent update mutation payload requires `status`.");
  }
  if ((payload.status === "taken" || payload.status === "taken_late") && !payload.takenAt) {
    // Defense-in-depth on top of chk_taken_has_timestamp (which today only
    // covers 'taken', not 'taken_late' -- a known, narrow, pre-existing
    // gap in that constraint's definition; this check covers both.
    throw new ValidationError("doseEvent transition to taken/taken_late requires `takenAt`.");
  }

  const [rows] = await withProfileScope(
    ctx.profileId,
    (db) => [
      db.execute(sql`
      WITH updated AS (
        UPDATE dose_event
        SET status = ${payload.status},
            taken_at = CASE WHEN ${payload.status} IN ('taken','taken_late') THEN ${payload.takenAt ?? null}::timestamptz ELSE taken_at END,
            quantity_value = COALESCE(${payload.quantityValue ?? null}::numeric, quantity_value),
            quantity_unit = COALESCE(${payload.quantityUnit ?? null}, quantity_unit),
            snooze_count = CASE WHEN ${payload.status} = 'snoozed' THEN snooze_count + 1 ELSE snooze_count END,
            reminder_at = COALESCE(${payload.reminderAt ?? null}::timestamptz, reminder_at),
            updated_at = now(), client_mutation_id = ${mutation.clientMutationId}::uuid
        WHERE id = ${mutation.entityId}::uuid
          AND status NOT IN ('taken','taken_late','skipped','missed','cancelled')
        RETURNING *
      ),
      current_row AS (
        SELECT * FROM updated
        UNION ALL
        SELECT * FROM dose_event WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM updated)
      ),
      recorded AS (
        INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
        SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'doseEvent', ${mutation.entityId}::uuid, 'applied', to_jsonb(current_row.*)
        FROM current_row
        RETURNING *
      ),
      logged AS (
        INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, occurred_at)
        SELECT profile_id, 'doseEvent', id, 'update', now() FROM updated
        RETURNING 1
      )
      SELECT current_row.* FROM current_row;
    `),
    ],
    { db: ctx.db },
  );

  const record = (rows as { rows?: Record<string, unknown>[] }).rows?.[0];
  // Always 'applied' -- even a no-op-because-already-terminal converges
  // silently to the current row; this entity's server handler never
  // returns 'conflict' (designing-offline-sync).
  return { clientMutationId: mutation.clientMutationId, result: "applied", serverRecord: record };
}

/**
 * `MedicationPackage` (Phase 2 §2.8, Phase 9) — optimistic concurrency,
 * same pattern as `applyMedicationScheduleMutation`. A package is always
 * created `status = 'unopened'`, `opened_at = NULL` — never client-
 * asserted; only an update mutation can transition status/openedAt.
 */
async function applyMedicationPackageMutation(ctx: MutationContext, mutation: SyncMutationRequest): Promise<SyncMutationResult> {
  if (mutation.operation === "delete") {
    if (mutation.baseVersion === undefined) {
      throw new ValidationError("medicationPackage delete mutations require `baseVersion`.");
    }
    const [rows] = await withProfileScope(
      ctx.profileId,
      (db) => [
        db.execute(sql`
        WITH updated AS (
          UPDATE medication_package
          SET deleted_at = now(), version = version + 1, updated_at = now(), client_mutation_id = ${mutation.clientMutationId}::uuid
          WHERE id = ${mutation.entityId}::uuid AND version = ${mutation.baseVersion} AND deleted_at IS NULL
          RETURNING *
        ),
        current_row AS (
          SELECT * FROM updated
          UNION ALL
          SELECT * FROM medication_package WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM updated)
        ),
        recorded AS (
          INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
          SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'medicationPackage', ${mutation.entityId}::uuid,
            CASE WHEN EXISTS (SELECT 1 FROM updated) THEN 'applied' ELSE 'conflict' END,
            to_jsonb(current_row.*)
          FROM current_row
          RETURNING result
        ),
        logged AS (
          INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, server_version, occurred_at)
          SELECT profile_id, 'medicationPackage', id, 'delete', version, now() FROM updated
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

  const payload = mutation.payload as {
    userMedicationId?: string;
    source?: string;
    gtin?: string | null;
    batchNumber?: string | null;
    serialNumber?: string | null;
    expiryDate?: string | null;
    receivedDate?: string;
    initialQuantityValue?: number;
    quantityUnit?: string;
    status?: string;
    openedAt?: string | null;
  };

  if (mutation.operation === "create") {
    if (!payload.userMedicationId || !payload.source || !payload.receivedDate || payload.initialQuantityValue === undefined || !payload.quantityUnit) {
      throw new ValidationError("medicationPackage create mutation payload is missing required fields.");
    }

    try {
      const [rows] = await withProfileScope(
        ctx.profileId,
        (db) => [
          db.execute(sql`
          WITH inserted AS (
            INSERT INTO medication_package (
              id, profile_id, user_medication_id, source, gtin, batch_number, serial_number,
              expiry_date, received_date, initial_quantity_value, quantity_unit, status,
              created_at, updated_at, version, client_mutation_id
            )
            VALUES (
              ${mutation.entityId}::uuid, ${ctx.profileId}::uuid, ${payload.userMedicationId}::uuid, ${payload.source},
              ${payload.gtin ?? null}, ${payload.batchNumber ?? null}, ${payload.serialNumber ?? null},
              ${payload.expiryDate ?? null}::date, ${payload.receivedDate}::date, ${payload.initialQuantityValue}::numeric, ${payload.quantityUnit},
              'unopened', now(), now(), 1, ${mutation.clientMutationId}::uuid
            )
            ON CONFLICT (id) DO NOTHING
            RETURNING *
          ),
          current_row AS (
            SELECT * FROM inserted
            UNION ALL
            SELECT * FROM medication_package WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM inserted)
          ),
          recorded AS (
            INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
            SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'medicationPackage', ${mutation.entityId}::uuid, 'applied', to_jsonb(current_row.*)
            FROM current_row
            RETURNING *
          ),
          logged AS (
            INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, server_version, occurred_at)
            SELECT profile_id, 'medicationPackage', id, 'create', version, now() FROM inserted
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
        throw new ValidationError("userMedicationId does not reference a known medication.");
      }
      throw err;
    }
  }

  // update — optimistic concurrency. `batchNumber`/`serialNumber`/
  // `expiryDate`/`openedAt` are genuinely nullable, so each uses the
  // explicit "was the key present in the JSON payload at all" CASE, same
  // convention as `applyMedicationScheduleMutation`'s `endDate`/
  // `weekdaysMask` — a plain COALESCE can't tell "not sent, keep existing"
  // apart from "sent as null, clear it".
  if (mutation.baseVersion === undefined) {
    throw new ValidationError("medicationPackage update mutations require `baseVersion`.");
  }

  const [rows] = await withProfileScope(
    ctx.profileId,
    (db) => [
      db.execute(sql`
      WITH updated AS (
        UPDATE medication_package
        SET batch_number = CASE WHEN ${payload.batchNumber !== undefined} THEN ${payload.batchNumber ?? null} ELSE batch_number END,
            serial_number = CASE WHEN ${payload.serialNumber !== undefined} THEN ${payload.serialNumber ?? null} ELSE serial_number END,
            expiry_date = CASE WHEN ${payload.expiryDate !== undefined} THEN ${payload.expiryDate ?? null}::date ELSE expiry_date END,
            status = COALESCE(${payload.status ?? null}, status),
            opened_at = CASE WHEN ${payload.openedAt !== undefined} THEN ${payload.openedAt ?? null}::timestamptz ELSE opened_at END,
            version = version + 1, updated_at = now(), client_mutation_id = ${mutation.clientMutationId}::uuid
        WHERE id = ${mutation.entityId}::uuid AND version = ${mutation.baseVersion} AND deleted_at IS NULL
        RETURNING *
      ),
      current_row AS (
        SELECT * FROM updated
        UNION ALL
        SELECT * FROM medication_package WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM updated)
      ),
      recorded AS (
        INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
        SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'medicationPackage', ${mutation.entityId}::uuid,
          CASE WHEN EXISTS (SELECT 1 FROM updated) THEN 'applied' ELSE 'conflict' END,
          to_jsonb(current_row.*)
        FROM current_row
        RETURNING result
      ),
      logged AS (
        INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, server_version, occurred_at)
        SELECT profile_id, 'medicationPackage', id, 'update', version, now() FROM updated
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

/**
 * `MedicationInventoryTransaction` (Phase 2 §2.9, ADR-010, Phase 9) — the
 * append-only ledger. Create-only, idempotent-by-id (same as `DoseEvent`);
 * there is no update/delete mutation for this entity at all (a correction
 * is a new offsetting row, never an edit). `uq_inventory_txn_dose_taken_once`
 * is the hard backstop the recovery branch below exists for: a retried
 * "taken" mutation (different attempt, same `dose_event_id`, but NOT
 * necessarily the same `id`/`client_mutation_id` if the client regenerated
 * its outbox entry) collides on that constraint rather than double-
 * consuming stock — recovered by returning the row that's actually there,
 * same pattern as `applyDoseEventMutation`'s `uq_dose_event_schedule_instance`
 * recovery.
 */
async function applyInventoryTransactionMutation(ctx: MutationContext, mutation: SyncMutationRequest): Promise<SyncMutationResult> {
  if (mutation.operation !== "create") {
    throw new ValidationError(`medicationInventoryTransaction is append-only — "${mutation.operation}" is not a valid operation.`);
  }

  const payload = mutation.payload as {
    userMedicationId?: string;
    packageId?: string | null;
    transactionType?: string;
    quantityDelta?: number;
    quantityUnit?: string;
    doseEventId?: string | null;
    occurredAt?: string;
    source?: string;
    note?: string | null;
  };

  if (
    !payload.userMedicationId ||
    !payload.transactionType ||
    payload.quantityDelta === undefined ||
    !payload.quantityUnit ||
    !payload.occurredAt ||
    !payload.source
  ) {
    throw new ValidationError("medicationInventoryTransaction create mutation payload is missing required fields.");
  }

  try {
    const [rows] = await withProfileScope(
      ctx.profileId,
      (db) => [
        db.execute(sql`
        WITH inserted AS (
          INSERT INTO medication_inventory_transaction (
            id, profile_id, user_medication_id, package_id, transaction_type,
            quantity_delta, quantity_unit, dose_event_id, occurred_at, recorded_at,
            source, note, client_mutation_id
          )
          VALUES (
            ${mutation.entityId}::uuid, ${ctx.profileId}::uuid, ${payload.userMedicationId}::uuid, ${payload.packageId ?? null}::uuid,
            ${payload.transactionType}, ${payload.quantityDelta}::numeric, ${payload.quantityUnit}, ${payload.doseEventId ?? null}::uuid,
            ${payload.occurredAt}::timestamptz, now(), ${payload.source}, ${payload.note ?? null}, ${mutation.clientMutationId}::uuid
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING *
        ),
        current_row AS (
          SELECT * FROM inserted
          UNION ALL
          SELECT * FROM medication_inventory_transaction WHERE id = ${mutation.entityId}::uuid AND NOT EXISTS (SELECT 1 FROM inserted)
        ),
        recorded AS (
          INSERT INTO sync_mutation (client_mutation_id, profile_id, entity_type, entity_id, result, response_snapshot)
          SELECT ${mutation.clientMutationId}::uuid, ${ctx.profileId}::uuid, 'medicationInventoryTransaction', ${mutation.entityId}::uuid, 'applied', to_jsonb(current_row.*)
          FROM current_row
          RETURNING *
        ),
        logged AS (
          INSERT INTO sync_change_log (profile_id, entity_type, entity_id, operation, occurred_at)
          SELECT profile_id, 'medicationInventoryTransaction', id, 'create', now() FROM inserted
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
      throw new ValidationError("userMedicationId, packageId, or doseEventId does not reference a known record.");
    }
    if (isUniqueViolation(err)) {
      // uq_inventory_txn_dose_taken_once -- a genuine collision on
      // dose_event_id for transaction_type='dose_taken', but a DIFFERENT
      // id (the expected deterministic-replay path is already handled by
      // ON CONFLICT (id) above without ever reaching this catch). Recover
      // by returning the row that's actually there.
      const [existingRows] = await withProfileScope(
        ctx.profileId,
        (db) => [
          db.execute(sql`
            SELECT * FROM medication_inventory_transaction
            WHERE dose_event_id = ${payload.doseEventId ?? null}::uuid
              AND transaction_type = 'dose_taken'
            LIMIT 1
          `),
        ],
        { db: ctx.db },
      );
      const record = (existingRows as { rows?: Record<string, unknown>[] }).rows?.[0];
      if (record) {
        return { clientMutationId: mutation.clientMutationId, result: "applied", serverRecord: record };
      }
    }
    throw err;
  }
}

function isForeignKeyViolation(err: unknown): boolean {
  return postgresErrorCode(err) === POSTGRES_FOREIGN_KEY_VIOLATION;
}

async function dispatchMutation(ctx: MutationContext, mutation: SyncMutationRequest): Promise<SyncMutationResult> {
  switch (mutation.entityType) {
    case "userPreferences":
      return applyUserPreferencesMutation(ctx, mutation);
    case "purchaseList":
      return applyPurchaseListMutation(ctx, mutation);
    case "userMedication":
      return applyUserMedicationMutation(ctx, mutation);
    case "medicationSchedule":
      return applyMedicationScheduleMutation(ctx, mutation);
    case "doseEvent":
      return applyDoseEventMutation(ctx, mutation);
    case "medicationPackage":
      return applyMedicationPackageMutation(ctx, mutation);
    case "medicationInventoryTransaction":
      return applyInventoryTransactionMutation(ctx, mutation);
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
      serverRecord: toCamelCaseRecord(existing.responseSnapshot as Record<string, unknown> | null),
    };
  }

  try {
    const result = await dispatchMutation(ctx, mutation);
    return { ...result, serverRecord: toCamelCaseRecord(result.serverRecord) };
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Lost a race against a concurrent identical retry — the other
      // request's write already landed; resolve this one as a replay.
      const nowExisting = await findExistingMutation(ctx.profileId, mutation.clientMutationId, ctx.db);
      if (nowExisting) {
        return {
          clientMutationId: mutation.clientMutationId,
          result: nowExisting.result as SyncMutationResult["result"],
          serverRecord: toCamelCaseRecord(nowExisting.responseSnapshot as Record<string, unknown> | null),
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
    try {
      results.push(await applyOneMutation(ctx, mutation));
    } catch (err) {
      // A real bug found via live-device testing (2026-08-30, Phase 10):
      // one mutation throwing (a genuine validation failure, or --
      // before `listPending`'s creation-order fix,
      // `lib/db-client/outbox-repository.ts` -- a DoseEvent create
      // whose MedicationSchedule hadn't landed yet within THIS SAME
      // batch) used to propagate uncaught, aborting the ENTIRE request
      // with one HTTP-level error. The client then had no way to tell
      // which mutations in the batch had actually succeeded before the
      // failure, and marked every one of them `failed` -- including
      // ones the server had already committed. Isolating each
      // mutation's failure here means the rest of an otherwise-valid
      // batch still applies, and the client gets an accurate per-
      // mutation result instead of one opaque batch-level failure.
      const appError = toAppError(err);
      logger.warn("sync.mutation.isolated_failure", {
        entityType: mutation.entityType,
        operation: mutation.operation,
        code: appError.code,
        httpStatus: appError.httpStatus,
      });
      results.push({
        clientMutationId: mutation.clientMutationId,
        result: "rejected",
        error: appError.isOperational ? appError.message : "Κάτι πήγε στραβά. Δοκιμάστε ξανά.",
      });
    }
  }
  return results;
}

/** Exposed for tests that want to build their own `Db` handle. */
export type { Db };
