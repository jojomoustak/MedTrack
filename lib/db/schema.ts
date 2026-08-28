/**
 * Drizzle ORM schema — the type-safe mirror of the DDL specified in
 * `docs/data-model/phase-2-data-model.md` (§2, §4, §5.1) and
 * `docs/adr/ADR-003-authentication.md` (account_credential/account_session/
 * account_verification).
 *
 * This file defines tables/columns/FKs/checks/indexes. Row-Level Security
 * (ENABLE/FORCE + policies, per Phase 2 §0 and ADR-002's pooling
 * constraint), the Postgres extensions it depends on, and the
 * schedule-subtype integrity trigger (Phase 2 §2.6, risk R15) are
 * deliberately NOT expressed here — they live in a hand-written SQL
 * migration (`lib/db/migrations/0001_rls_and_triggers.sql`) so the whole
 * security-critical surface is reviewable in one place rather than
 * scattered across generated table blocks. See that file's header comment.
 *
 * Column naming: JS/TS property names are camelCase; the first argument to
 * every column builder pins the actual snake_case DB column name so the
 * two never drift silently.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  char,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Postgres `citext` (case-insensitive text) — requires the `citext` extension (migration 0000). */
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

// ---------------------------------------------------------------------------
// 2.1 Account — login identity (Phase 2 §2.1)
// ---------------------------------------------------------------------------
export const account = pgTable(
  "account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull(),
    emailVerifiedAt: timestamptz("email_verified_at"),
    displayName: text("display_name"),
    // Found via a REAL Google OAuth click-through (2026-08-21): a
    // brand-new Google sign-up 500'd with `[Better Auth]:
    // unable_to_create_user`, which turned out to wrap a swallowed
    // `BetterAuthError` ('The field "image" does not exist in the
    // "loginAccount" Drizzle schema...') — Better Auth's core `user`
    // model always includes a nullable `image` field
    // (`@better-auth/core/db/schema/user.mjs`), and Google's OAuth
    // profile always populates it (the account's avatar/`picture` claim),
    // so every Google sign-up tries to write it. Email/password sign-up
    // never sends this field, which is exactly why this went unnoticed
    // until a live Google round-trip. Mapped via `user.fields.image` in
    // `lib/auth/config.ts` — same pattern as `displayName`/`name` above.
    avatarUrl: text("avatar_url"),
    status: text("status").notNull().default("active"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_account_email").on(t.email),
    check("chk_account_status", sql`${t.status} IN ('active','suspended','pending_deletion','deleted')`),
  ],
);

// ---------------------------------------------------------------------------
// 2.2 Profile — medical-data owner (Phase 2 §2.2)
// ---------------------------------------------------------------------------
export const profile = pgTable("profile", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerAccountId: uuid("owner_account_id")
    .notNull()
    .unique()
    .references(() => account.id),
  displayName: text("display_name"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  deletedAt: timestamptz("deleted_at"),
});

// ---------------------------------------------------------------------------
// 2.3 UserPreferences — app-level prefs, account-scoped not profile-scoped
// (Phase 2 §2.3)
// ---------------------------------------------------------------------------
export const userPreferences = pgTable(
  "user_preferences",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => account.id),
    theme: text("theme").notNull().default("system"),
    language: text("language").notNull().default("el"),
    reminderDefaultSnoozeMinutes: smallint("reminder_default_snooze_minutes").notNull().default(10),
    accessibilityTextScale: numeric("accessibility_text_scale", { precision: 3, scale: 2 }).notNull().default("1.00"),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    clientUpdatedAt: timestamptz("client_updated_at"),
  },
  (t) => [
    check("chk_preferences_theme", sql`${t.theme} IN ('system','light','dark')`),
    check("chk_preferences_snooze_positive", sql`${t.reminderDefaultSnoozeMinutes} > 0`),
    check(
      "chk_preferences_text_scale_range",
      sql`${t.accessibilityTextScale} BETWEEN 1.00 AND 3.00`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 2.4 MedicationCatalogProduct — shared reference data, no owner, no RLS
// (Phase 2 §2.4, ADR-004)
// ---------------------------------------------------------------------------
export const medicationCatalogProduct = pgTable(
  "medication_catalog_product",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gtin: text("gtin"),
    // Path A resolution key (architecture doc §2.5) — the 9-digit EOF
    // product code embedded in a Greek national `280`-prefix EAN-13
    // barcode (`lib/domain/greek-national-barcode.ts`). Distinct from
    // `gtin`: a Greek national barcode is not a globally-resolvable GTIN
    // (architecture doc §2.1), so this is deliberately its own column,
    // never conflated with or derived from `gtin` at query time. Text, not
    // numeric — leading zeros are significant (e.g. `023280101`).
    eofCode: text("eof_code"),
    name: text("name").notNull(),
    // Uses `immutable_unaccent` (defined in migration 0000), not the bare
    // `unaccent()` extension function directly: Postgres refuses a
    // GENERATED ALWAYS AS expression that isn't provably IMMUTABLE, and
    // `unaccent()` is only STABLE. This is the standard, documented
    // workaround (wrap it in a same-behavior function explicitly marked
    // IMMUTABLE) — confirmed necessary by actually running this migration
    // against a real Postgres instance, not assumed.
    nameNormalized: text("name_normalized").generatedAlwaysAs(sql`lower(immutable_unaccent(name))`),
    manufacturer: text("manufacturer"),
    activeIngredient: text("active_ingredient"),
    strengthValue: numeric("strength_value", { precision: 12, scale: 3 }),
    strengthUnit: text("strength_unit"),
    form: text("form"),
    packSizeValue: numeric("pack_size_value", { precision: 12, scale: 3 }),
    packSizeUnit: text("pack_size_unit"),
    regulatorySource: text("regulatory_source").notNull(),
    sourceVersion: text("source_version"),
    sourceLastUpdated: timestamptz("source_last_updated"),
    lifecycleState: text("lifecycle_state").notNull().default("active"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_catalog_gtin").on(t.gtin).where(sql`${t.gtin} IS NOT NULL`),
    uniqueIndex("uq_catalog_eof_code").on(t.eofCode).where(sql`${t.eofCode} IS NOT NULL`),
    index("ix_catalog_name_trgm").using("gin", t.nameNormalized.op("gin_trgm_ops")),
    check(
      "chk_catalog_form",
      sql`${t.form} IS NULL OR ${t.form} IN ('tablet','capsule','ml','mg','mcg','g','dose','spray','drop','sachet','patch','injection','other')`,
    ),
    check("chk_catalog_lifecycle_state", sql`${t.lifecycleState} IN ('active','discontinued','recalled')`),
  ],
);

// ---------------------------------------------------------------------------
// 2.4a1 MedicationIdentifier — multi-identifier model (GTIN-resolution task
// spec §1/§5/§12/§19). `medication_catalog_product.eof_code`/`gtin` above
// are UNCHANGED and remain Path A's proven, fast lookup path (never
// migrated off — "do not restart the catalog work"). This table is
// strictly additive: it's where the NEW identifier types this task adds
// live — primarily `GTIN` (a real GS1 DataMatrix's serialized GTIN, which
// a Greek national EAN-13's `280`-prefix code structurally is NOT — see
// `lib/domain/greek-national-barcode.ts`'s header comment), with `NHRN`/
// `EAN13` reserved for whatever a future authoritative source supplies,
// without needing a schema change to ingest it (spec §5/§7).
//
// One product may have MULTIPLE rows here (spec §5: "do not impose a
// one-to-one package → GTIN relationship") — e.g. two real GTINs for two
// repackaging events of the same product. Deliberately NOT unique on
// (identifier_type, identifier_value) alone: that would make a genuine
// conflict (two DIFFERENT products both authoritatively claiming the same
// GTIN, spec §19) impossible to represent at all, when the correct
// behavior is to preserve BOTH rows and surface `CONFLICT` at query time
// (`lib/catalog/server/postgres-provider.ts`'s `lookupByIdentifier`),
// never silently pick one. The narrower uniqueness constraint below only
// prevents the same source from creating an exact duplicate row on a
// repeated import — a real conflict (different `catalog_product_id`)
// still passes it freely.
// ---------------------------------------------------------------------------
export const medicationIdentifier = pgTable(
  "medication_identifier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    catalogProductId: uuid("catalog_product_id")
      .notNull()
      .references(() => medicationCatalogProduct.id),
    identifierType: text("identifier_type").notNull(),
    // Text, never numeric (spec §18) — leading zeros are significant for
    // EOF/NHRN-derived values, and GTIN-14's own canonical form is
    // fixed-width. Canonical representation: GTIN is stored exactly as
    // decoded from AI 01 (`lib/domain/gs1.ts`'s existing 14-digit
    // left-zero-padded normalization — the same form already used for
    // `medication_catalog_product.gtin` and the offline cache, so no new
    // normalization convention is introduced). Never silently re-padded
    // or re-derived at query time — whatever form was stored is what's
    // matched against, byte for byte.
    identifierValue: text("identifier_value").notNull(),
    source: text("source").notNull(),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ix_medication_identifier_lookup").on(t.identifierType, t.identifierValue),
    index("ix_medication_identifier_product").on(t.catalogProductId),
    uniqueIndex("uq_medication_identifier_no_dupe_import").on(t.catalogProductId, t.identifierType, t.identifierValue, t.source),
    check("chk_medication_identifier_type", sql`${t.identifierType} IN ('EOF_CODE','NHRN','EAN13','GTIN')`),
  ],
);

// ---------------------------------------------------------------------------
// 2.4a MedicationCatalogSourceSnapshot — import-batch provenance for
// development-only catalog ingestion (architecture doc §13/§30, added
// alongside the Greek national EAN-13 resolution path). Records WHERE a
// batch of catalog rows came from (which official file, when published,
// when downloaded, its checksum) so a catalog row's `regulatorySource`/
// `sourceVersion` (per-row, already on `medicationCatalogProduct`) can be
// traced back to the actual dataset file it was imported from. This is
// batch/file-level provenance; per-row provenance already exists via the
// three `source*` columns above — this table does not duplicate that, it
// answers a different question ("which download produced these rows").
// ---------------------------------------------------------------------------
export const medicationCatalogSourceSnapshot = pgTable(
  "medication_catalog_source_snapshot",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceOrganization: text("source_organization").notNull(),
    datasetType: text("dataset_type").notNull(),
    sourceUrl: text("source_url").notNull(),
    publishedAt: date("published_at"),
    downloadedAt: timestamptz("downloaded_at").notNull().defaultNow(),
    filename: text("filename").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    importVersion: text("import_version").notNull(),
    recordCount: integer("record_count"),
    status: text("status").notNull().default("downloaded"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "chk_snapshot_source_organization",
      sql`${t.sourceOrganization} IN ('EOF','MINISTRY_OF_HEALTH')`,
    ),
    check(
      "chk_snapshot_dataset_type",
      sql`${t.datasetType} IN ('REIMBURSED_PRICE_BULLETIN','MYSYFA_PRICE_BULLETIN','NEW_PRODUCTS','GENERICS','OTHER')`,
    ),
    check(
      "chk_snapshot_status",
      sql`${t.status} IN ('downloaded','parsed','imported','rejected')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 2.5 UserMedication (Phase 2 §2.5)
// ---------------------------------------------------------------------------
export const userMedication = pgTable(
  "user_medication",
  {
    id: uuid("id").primaryKey(), // client-generatable, no server default
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    catalogProductId: uuid("catalog_product_id").references(() => medicationCatalogProduct.id),
    customName: text("custom_name"),
    customForm: text("custom_form"),
    customStrengthValue: numeric("custom_strength_value", { precision: 12, scale: 3 }),
    customStrengthUnit: text("custom_strength_unit"),
    treatmentState: text("treatment_state").notNull().default("active"),
    inventoryUnit: text("inventory_unit").notNull(),
    lowStockThresholdValue: numeric("low_stock_threshold_value", { precision: 12, scale: 3 }),
    expiryWarningDays: smallint("expiry_warning_days").notNull().default(30),
    notes: text("notes"),
    // User-uploaded photo of their own medication package (added post-Phase
    // 6, web-engineer task "user-uploaded medication photo"). Deliberately
    // NOT the same concern as `MedicationCatalogProduct` photo-sourcing
    // (that's a separate, catalog-side research task) — this is one
    // user's own camera photo of their own package. Stores the Vercel Blob
    // object's PATHNAME (not a public URL): `@vercel/blob`'s `put()` is
    // called with `access: "private"`, so the pathname alone is useless
    // without the server's `BLOB_READ_WRITE_TOKEN` — the client never sees
    // this value; every read goes through the authenticated
    // `GET /api/medications/[id]/photo` proxy route
    // (`lib/medications/server/photo.ts`), never a bare CDN URL. Not part
    // of the offline outbox/sync system on purpose (no meaningful offline
    // story for binary blob storage, unlike every other field here) —
    // uploading/viewing a photo requires network; `version` is
    // deliberately NEVER bumped by a photo write so a stale-looking
    // `baseVersion` on the client can't spuriously conflict with an
    // unrelated field it never touched.
    photoBlobKey: text("photo_blob_key"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamptz("deleted_at"),
    clientMutationId: uuid("client_mutation_id").notNull(),
  },
  (t) => [
    index("ix_user_medication_profile").on(t.profileId).where(sql`${t.deletedAt} IS NULL`),
    check(
      "chk_catalog_or_manual",
      sql`${t.catalogProductId} IS NOT NULL OR ${t.customName} IS NOT NULL`,
    ),
    check(
      "chk_user_medication_treatment_state",
      sql`${t.treatmentState} IN ('active','completed','paused','discontinued')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 2.6 MedicationSchedule + subtype tables (Phase 2 §2.6)
// ---------------------------------------------------------------------------
export const medicationSchedule = pgTable(
  "medication_schedule",
  {
    id: uuid("id").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    userMedicationId: uuid("user_medication_id")
      .notNull()
      .references(() => userMedication.id),
    scheduleKind: text("schedule_kind").notNull(),
    timeAnchor: text("time_anchor"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    timezone: text("timezone").notNull().default("Europe/Athens"),
    doseQuantityValue: numeric("dose_quantity_value", { precision: 12, scale: 3 }).notNull(),
    doseQuantityUnit: text("dose_quantity_unit").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamptz("deleted_at"),
    clientMutationId: uuid("client_mutation_id").notNull(),
  },
  (t) => [
    check(
      "chk_schedule_kind",
      sql`${t.scheduleKind} IN ('daily','multiple_times_daily','specific_weekdays','every_n_hours','prn')`,
    ),
    check("chk_schedule_time_anchor", sql`${t.timeAnchor} IS NULL OR ${t.timeAnchor} IN ('wall_clock','elapsed')`),
    check("chk_end_after_start", sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
    check("chk_dose_quantity_positive", sql`${t.doseQuantityValue} > 0`),
    check(
      "chk_anchor_matches_kind",
      sql`(${t.scheduleKind} = 'prn' AND ${t.timeAnchor} IS NULL) OR
          (${t.scheduleKind} IN ('daily','multiple_times_daily','specific_weekdays') AND ${t.timeAnchor} = 'wall_clock') OR
          (${t.scheduleKind} = 'every_n_hours' AND ${t.timeAnchor} = 'elapsed')`,
    ),
  ],
);

/** Wall-clock subtype: local `TIME`s re-evaluated against `timezone` daily — re-anchors across DST. */
export const medicationScheduleWallClock = pgTable(
  "medication_schedule_wall_clock",
  {
    scheduleId: uuid("schedule_id")
      .primaryKey()
      .references(() => medicationSchedule.id, { onDelete: "cascade" }),
    timesOfDay: time("times_of_day").array().notNull(),
    weekdaysMask: smallint("weekdays_mask"),
  },
  (t) => [check("chk_times_nonempty", sql`cardinality(${t.timesOfDay}) >= 1`)],
);

/** Elapsed-time subtype: fixed UTC instant + interval — never re-anchors on DST/timezone change. */
export const medicationScheduleElapsed = pgTable(
  "medication_schedule_elapsed",
  {
    scheduleId: uuid("schedule_id")
      .primaryKey()
      .references(() => medicationSchedule.id, { onDelete: "cascade" }),
    intervalHours: smallint("interval_hours").notNull(),
    anchorAt: timestamptz("anchor_at").notNull(),
  },
  (t) => [check("chk_interval_hours_range", sql`${t.intervalHours} BETWEEN 1 AND 168`)],
);

// ---------------------------------------------------------------------------
// 2.7 DoseEvent (Phase 2 §2.7)
// ---------------------------------------------------------------------------
export const doseEvent = pgTable(
  "dose_event",
  {
    id: uuid("id").primaryKey(), // stable, client-generatable — the idempotency anchor
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    userMedicationId: uuid("user_medication_id")
      .notNull()
      .references(() => userMedication.id),
    scheduleId: uuid("schedule_id").references(() => medicationSchedule.id),
    scheduledAt: timestamptz("scheduled_at"),
    reminderAt: timestamptz("reminder_at"),
    takenAt: timestamptz("taken_at"),
    status: text("status").notNull().default("scheduled"),
    quantityValue: numeric("quantity_value", { precision: 12, scale: 3 }),
    quantityUnit: text("quantity_unit"),
    source: text("source").notNull(),
    snoozeCount: smallint("snooze_count").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    clientMutationId: uuid("client_mutation_id").notNull(),
  },
  (t) => [
    uniqueIndex("uq_dose_event_schedule_instance")
      .on(t.userMedicationId, t.scheduleId, t.scheduledAt)
      .where(sql`${t.scheduleId} IS NOT NULL`),
    index("ix_dose_event_profile_today").on(t.profileId, t.scheduledAt),
    check(
      "chk_dose_event_status",
      sql`${t.status} IN ('scheduled','reminded','taken','taken_late','snoozed','skipped','missed','cancelled')`,
    ),
    check("chk_dose_event_source", sql`${t.source} IN ('schedule_generated','manual_prn','manual_backfill')`),
    check("chk_taken_has_timestamp", sql`${t.status} <> 'taken' OR ${t.takenAt} IS NOT NULL`),
  ],
);

// ---------------------------------------------------------------------------
// 2.8 MedicationPackage (Phase 2 §2.8)
// ---------------------------------------------------------------------------
export const medicationPackage = pgTable(
  "medication_package",
  {
    id: uuid("id").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    userMedicationId: uuid("user_medication_id")
      .notNull()
      .references(() => userMedication.id),
    source: text("source").notNull(),
    gtin: text("gtin"),
    batchNumber: text("batch_number"),
    serialNumber: text("serial_number"),
    expiryDate: date("expiry_date"),
    receivedDate: date("received_date").notNull().default(sql`CURRENT_DATE`),
    initialQuantityValue: numeric("initial_quantity_value", { precision: 12, scale: 3 }).notNull(),
    quantityUnit: text("quantity_unit").notNull(),
    status: text("status").notNull().default("unopened"),
    openedAt: timestamptz("opened_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamptz("deleted_at"),
    clientMutationId: uuid("client_mutation_id").notNull(),
  },
  (t) => [
    index("ix_package_expiry")
      .on(t.expiryDate)
      .where(sql`${t.status} NOT IN ('discarded') AND ${t.deletedAt} IS NULL`),
    check("chk_package_source", sql`${t.source} IN ('scan','manual')`),
    check(
      "chk_package_status",
      sql`${t.status} IN ('unopened','opened','depleted','discarded','expired')`,
    ),
    check("chk_package_initial_quantity_positive", sql`${t.initialQuantityValue} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// 2.9 MedicationInventoryTransaction — the ledger (Phase 2 §2.9, ADR-010)
// ---------------------------------------------------------------------------
export const medicationInventoryTransaction = pgTable(
  "medication_inventory_transaction",
  {
    id: uuid("id").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    userMedicationId: uuid("user_medication_id")
      .notNull()
      .references(() => userMedication.id),
    packageId: uuid("package_id").references(() => medicationPackage.id),
    transactionType: text("transaction_type").notNull(),
    quantityDelta: numeric("quantity_delta", { precision: 12, scale: 3 }).notNull(),
    quantityUnit: text("quantity_unit").notNull(),
    doseEventId: uuid("dose_event_id").references(() => doseEvent.id),
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
    recordedAt: timestamptz("recorded_at").notNull().defaultNow(),
    source: text("source").notNull(),
    note: text("note"),
    clientMutationId: uuid("client_mutation_id").notNull(),
  },
  (t) => [
    // THE idempotency constraint ADR-010 requires: at most one dose_taken ledger row per dose event.
    uniqueIndex("uq_inventory_txn_dose_taken_once")
      .on(t.doseEventId)
      .where(sql`${t.transactionType} = 'dose_taken'`),
    uniqueIndex("uq_inventory_txn_client_mutation").on(t.clientMutationId),
    index("ix_inventory_txn_medication").on(t.userMedicationId, t.occurredAt),
    check(
      "chk_inventory_txn_type",
      sql`${t.transactionType} IN ('package_opened','dose_taken','refill','manual_correction','package_discarded','dose_reversed')`,
    ),
    check("chk_inventory_txn_quantity_delta_nonzero", sql`${t.quantityDelta} <> 0`),
    check("chk_inventory_txn_source", sql`${t.source} IN ('user','system','sync_recovery')`),
    check(
      "chk_dose_txn_has_event",
      sql`(${t.transactionType} IN ('dose_taken','dose_reversed') AND ${t.doseEventId} IS NOT NULL) OR
          (${t.transactionType} NOT IN ('dose_taken','dose_reversed') AND ${t.doseEventId} IS NULL)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 2.10 Favorite (Phase 2 §2.10)
// ---------------------------------------------------------------------------
export const favorite = pgTable(
  "favorite",
  {
    id: uuid("id").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    userMedicationId: uuid("user_medication_id")
      .notNull()
      .references(() => userMedication.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    clientUpdatedAt: timestamptz("client_updated_at"),
    removedAt: timestamptz("removed_at"),
    clientMutationId: uuid("client_mutation_id").notNull(),
  },
  (t) => [uniqueIndex("uq_favorite_profile_medication").on(t.profileId, t.userMedicationId)],
);

// ---------------------------------------------------------------------------
// 2.11 RecentlyUsedEvent (Phase 2 §2.11)
// ---------------------------------------------------------------------------
export const recentlyUsedEvent = pgTable(
  "recently_used_event",
  {
    id: uuid("id").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    userMedicationId: uuid("user_medication_id")
      .notNull()
      .references(() => userMedication.id),
    interactionType: text("interaction_type").notNull(),
    occurredAt: timestamptz("occurred_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ix_recent_profile_time").on(t.profileId, t.occurredAt.desc()),
    check(
      "chk_recent_interaction_type",
      sql`${t.interactionType} IN ('viewed','marked_taken','edited','scanned')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// 2.12 PurchaseList / PurchaseListItem (Phase 2 §2.12)
// ---------------------------------------------------------------------------
export const purchaseList = pgTable("purchase_list", {
  id: uuid("id").primaryKey(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profile.id),
  name: text("name").notNull(),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  version: integer("version").notNull().default(1),
  deletedAt: timestamptz("deleted_at"),
  clientMutationId: uuid("client_mutation_id").notNull(),
});

export const purchaseListItem = pgTable(
  "purchase_list_item",
  {
    id: uuid("id").primaryKey(),
    purchaseListId: uuid("purchase_list_id")
      .notNull()
      .references(() => purchaseList.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    userMedicationId: uuid("user_medication_id").references(() => userMedication.id),
    label: text("label"),
    quantityValue: numeric("quantity_value", { precision: 12, scale: 3 }),
    quantityUnit: text("quantity_unit"),
    estimatedUnitPriceCents: integer("estimated_unit_price_cents"),
    actualPaidPriceCents: integer("actual_paid_price_cents"),
    currency: char("currency", { length: 3 }).notNull().default("EUR"),
    status: text("status").notNull().default("pending"),
    purchasedAt: timestamptz("purchased_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamptz("deleted_at"),
    clientMutationId: uuid("client_mutation_id").notNull(),
  },
  (t) => [
    check("chk_item_has_label", sql`${t.userMedicationId} IS NOT NULL OR ${t.label} IS NOT NULL`),
    check(
      "chk_item_status",
      sql`${t.status} IN ('pending','purchased','removed')`,
    ),
    check(
      "chk_item_estimated_price_nonneg",
      sql`${t.estimatedUnitPriceCents} IS NULL OR ${t.estimatedUnitPriceCents} >= 0`,
    ),
    check(
      "chk_item_actual_price_nonneg",
      sql`${t.actualPaidPriceCents} IS NULL OR ${t.actualPaidPriceCents} >= 0`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// §5.1 Sync-support tables
// ---------------------------------------------------------------------------
export const syncMutation = pgTable(
  "sync_mutation",
  {
    clientMutationId: uuid("client_mutation_id").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    appliedAt: timestamptz("applied_at").notNull().defaultNow(),
    result: text("result").notNull(),
    responseSnapshot: jsonb("response_snapshot"),
  },
  (t) => [check("chk_sync_mutation_result", sql`${t.result} IN ('applied','conflict','rejected')`)],
);

export const syncChangeLog = pgTable(
  "sync_change_log",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    operation: text("operation").notNull(),
    serverVersion: integer("server_version"),
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("ix_sync_change_log_pull").on(t.profileId, t.id),
    check("chk_sync_change_log_operation", sql`${t.operation} IN ('create','update','delete')`),
  ],
);

// ---------------------------------------------------------------------------
// §4 Deletion audit — hard-delete workflow (Phase 2 §4)
// ---------------------------------------------------------------------------
export const deletedProfileRegistry = pgTable(
  "deleted_profile_registry",
  {
    profileId: uuid("profile_id").primaryKey(), // no FK — referenced row is gone by design
    accountIdHash: text("account_id_hash").notNull(),
    deletedAt: timestamptz("deleted_at").notNull().defaultNow(),
    reason: text("reason").notNull(),
  },
  (t) => [check("chk_deleted_registry_reason", sql`${t.reason} IN ('user_requested','account_deletion')`)],
);

export const accountDeletionAudit = pgTable(
  "account_deletion_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountIdHash: text("account_id_hash").notNull(),
    requestedAt: timestamptz("requested_at").notNull().defaultNow(),
    completedAt: timestamptz("completed_at"),
    method: text("method").notNull(),
    outcome: text("outcome").notNull().default("in_progress"),
    actor: text("actor"),
  },
  (t) => [
    check("chk_deletion_audit_method", sql`${t.method} IN ('user_initiated','admin','legal_request')`),
    check("chk_deletion_audit_outcome", sql`${t.outcome} IN ('in_progress','completed','failed')`),
  ],
);

// ---------------------------------------------------------------------------
// ADR-003 — Better Auth schema (account_credential / account_session /
// account_verification), mapped onto this project's own naming
// conventions rather than Better Auth's generated defaults.
// ---------------------------------------------------------------------------
export const accountCredential = pgTable(
  "account_credential",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // TS property deliberately NOT named `accountId` (the DB column is
    // still literally `account_id`, unchanged — this is a pure
    // application-layer rename, no migration). Found via a REAL
    // repeat-Google-sign-in click-through (2026-08-22): naming this
    // property/field-mapping value "accountId" collided with Better
    // Auth's OWN, genuinely different canonical field ALSO called
    // `accountId` on its "account" model (the OAuth provider's account
    // id/sub — what we map to `providerAccountId` below). Better Auth's
    // internal `getDefaultFieldName` (`@better-auth/core/db/adapter/
    // get-default-field-name.mjs`) resolves a mapped field name by first
    // checking "is this string ALSO a literal canonical field key on this
    // model" BEFORE checking "is this the fieldName some other field was
    // mapped to" — so our own "accountId" mapping (intended for Better
    // Auth's canonical `userId`) was silently misresolved as Better
    // Auth's unrelated canonical `accountId` field instead. This only
    // actually executes inside `handleFallbackJoin`
    // (`@better-auth/core/db/adapter/factory.mjs`) — Better Auth's
    // internal join fallback used by `findAccountOwnerByKey`/
    // `findUserByEmail(...,{includeAccounts:true})`/`findSession(s)` —
    // and that fallback is only reached once a matching row actually
    // exists to join against, which structurally cannot happen on a
    // FIRST sign-in (no prior credential row yet) but always happens on
    // a REPEAT one — exactly matching "first sign-in worked, second
    // 500'd with 'unable to query your database'". Renamed to
    // `loginAccountId` (and `lib/auth/config.ts`'s `userId: "accountId"`
    // mapping updated to match) so the mapped string can never again
    // literal-collide with any of Better Auth's own canonical field
    // names on this model.
    loginAccountId: uuid("account_id")
      .notNull()
      .references(() => account.id),
    // Default/CHECK value 'credential' (not the originally-drafted
    // 'password') matches Better Auth's own hardcoded providerId literal
    // for its built-in email/password auth method — confirmed by running
    // a real sign-up against a live Postgres instance and observing the
    // exact string Better Auth writes. 'password' is kept as a second
    // allowed value for forward compatibility with any manually-seeded or
    // non-Better-Auth-originated row; this project only ever writes
    // 'credential' via the app. Flagged here as a Phase 4 correction to
    // ADR-003's illustrative DDL, not a silent reinterpretation of it.
    credentialType: text("credential_type").notNull().default("credential"),
    passwordHash: text("password_hash"),
    hashAlgorithm: text("hash_algorithm"),
    hashParams: jsonb("hash_params"),
    passwordUpdatedAt: timestamptz("password_updated_at"),
    failedLoginCount: smallint("failed_login_count").notNull().default(0),
    lockedUntil: timestamptz("locked_until"),
    // --- Phase 4 addition, flagged for data-architect follow-up ---
    // ADR-003's original DDL (this table) did not include these two
    // columns. They were added after discovering — by actually running
    // Better Auth's sign-up flow against a live Postgres instance, not by
    // inspection alone — that Better Auth's own internal "account" model
    // (one row per credential/provider, which this table implements per
    // ADR-003) unconditionally requires an `issuer` and a provider-scoped
    // `accountId` for every credential type, including plain
    // email/password. Nullable, additive, no existing column repurposed;
    // `provider_account_id` deliberately never named `account_id` (that
    // name is already this table's FK to the login identity) to avoid
    // exactly the kind of ambiguity this whole column pair is a workaround
    // for. Not used by any application logic outside the Better Auth
    // adapter wiring (`lib/auth/config.ts`).
    providerIssuer: text("provider_issuer"),
    providerAccountId: text("provider_account_id"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    // --- ADR-003 addendum (2026-08-21), "Sign in with Google", A.2 ---
    // `provider_account_id` above already covers Better Auth's OAuth
    // `accountId` (Google's `sub` claim) — the addendum's A.2 illustrative
    // DDL re-adds it under the same name, so it's reused rather than
    // duplicated. The columns below are genuinely new. `credential_type`'s
    // CHECK is widened to add `'google'` alongside the existing
    // `'credential'`/`'password'` values (the addendum's illustrative DDL
    // said `('password', 'google')`, written before this table's real
    // `'credential'` literal — discovered by running a live sign-up,
    // Phase 4 — was known; extending in place rather than narrowing).
    linkedAt: timestamptz("linked_at"), // when this OAuth identity was linked; NULL for password rows
    emailAtLinkTime: text("email_at_link_time"), // audit only, never re-synced after link time
    // Kept always-NULL by application logic (data minimization, A.3): the
    // Drizzle adapter's field mapping needs somewhere to write Better
    // Auth's OAuth token fields, but MedTracking never persists them —
    // `databaseHooks.account.create.before`/`update.before` in
    // `lib/auth/config.ts` null these out on every write.
    oauthAccessToken: text("oauth_access_token"),
    oauthRefreshToken: text("oauth_refresh_token"),
    oauthIdToken: text("oauth_id_token"),
    oauthScope: text("oauth_scope"),
    oauthAccessTokenExpiresAt: timestamptz("oauth_access_token_expires_at"),
    oauthRefreshTokenExpiresAt: timestamptz("oauth_refresh_token_expires_at"),
  },
  (t) => [
    uniqueIndex("uq_account_credential_type").on(t.loginAccountId, t.credentialType),
    // One Google identity can only ever be linked to one MedTracking account (A.2).
    uniqueIndex("uq_account_credential_provider_identity")
      .on(t.credentialType, t.providerAccountId)
      .where(sql`${t.providerAccountId} IS NOT NULL`),
    check("chk_credential_type", sql`${t.credentialType} IN ('credential','password','google')`),
    check("chk_credential_hash_algorithm", sql`${t.hashAlgorithm} IS NULL OR ${t.hashAlgorithm} IN ('argon2id')`),
  ],
);

export const accountSession = pgTable(
  "account_session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    lastSeenAt: timestamptz("last_seen_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at").notNull(),
    revokedAt: timestamptz("revoked_at"),
    revokedReason: text("revoked_reason"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    deviceLabel: text("device_label"),
  },
  (t) => [
    uniqueIndex("uq_account_session_token_hash").on(t.tokenHash),
    index("ix_account_session_account_active").on(t.accountId).where(sql`${t.revokedAt} IS NULL`),
    check(
      "chk_session_revoked_reason",
      sql`${t.revokedReason} IS NULL OR ${t.revokedReason} IN ('user_logout','logout_all_devices','password_changed','admin_revoked','account_deleted')`,
    ),
  ],
);

export const accountVerification = pgTable(
  "account_verification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // --- Correction found via a REAL Google OAuth click-through (2026-08-21) ---
    // Originally `.notNull()`, which is correct for password-reset/
    // email-verification (an account always exists there) but wrong for
    // Better Auth's OAuth *initiation* write: `generateGenericState`
    // (`node_modules/better-auth/dist/state.mjs`) calls
    // `internalAdapter.createVerificationValue({ identifier, value,
    // expiresAt })` to persist PKCE/state data the moment a user clicks
    // "Sign in with Google" — genuinely BEFORE any account is known (it's
    // what the callback later resolves an account FROM, not the other
    // way around). Confirmed by reading the pinned Better Auth version's
    // source, not assumed: that call has no `userId`/`accountId`
    // equivalent anywhere in its payload. A live click-through 500'd with
    // `null value in column "account_id"` until this was made nullable.
    accountId: uuid("account_id").references(() => account.id),
    // No longer CHECK-constrained to a fixed 2-value enum — same
    // discovery. `purpose` is mapped (`lib/auth/config.ts`) onto Better
    // Auth's generic `identifier` field, whose REAL values (confirmed by
    // reading the pinned version's source) are never the literal strings
    // `'email_verify'`/`'password_reset'`: password-reset uses
    // `reset-password:<token>` (`api/routes/password.mjs`) and OAuth
    // state uses a bare random 32-char string (`oauth2/state.mjs`) — the
    // original CHECK was written against an idealized shape, never
    // verified against real Better Auth output, and would have rejected
    // the real password-reset flow too the first time that feature was
    // ever built and exercised (never yet exercised in this app, which is
    // exactly why this went unnoticed until a live OAuth round-trip).
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    consumedAt: timestamptz("consumed_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    // Phase 4 addition (same reason as account_session.last_seen_at /
    // account_credential.provider_issuer/provider_account_id above):
    // Better Auth's core schema requires every model to have `updatedAt`,
    // confirmed by running a live sign-up flow. No existing column here
    // has equivalent meaning (unlike account_session's last_seen_at), so
    // this is a genuine additive nullable column rather than a mapping.
    updatedAt: timestamptz("updated_at"),
  },
  (t) => [
    uniqueIndex("uq_account_verification_token_hash").on(t.tokenHash),
    // Better Auth's `findVerificationValue` (`db/internal-adapter.mjs`)
    // queries by `identifier` (our `purpose`) alone, sorted by
    // `createdAt` desc, `limit 1` — confirmed by reading the pinned
    // version's source. `uq_account_verification_token_hash` above
    // doesn't serve that query at all; this index does.
    index("ix_account_verification_identifier").on(t.purpose, t.createdAt.desc()),
  ],
);
