/**
 * The compact "Device Offline Index" (catalog-coverage task spec §12) —
 * deliberately a much narrower record shape than `CatalogProduct`
 * (`lib/domain/catalog.ts`): no ATC, no pricing metadata, no per-field
 * provenance, no source-snapshot linkage. That richer data stays
 * server-side only; only what a device needs to identify a scanned
 * barcode and show a candidate offline gets synced (spec §12: "Do not
 * synchronize unnecessary server metadata").
 *
 * Pure, I/O-free — no DB access, no crypto/hashing (that's
 * `lib/catalog/server/offline-index.ts`, which calls this and adds the
 * manifest/checksum layer). Kept separate so this shaping logic is
 * testable without a database, matching every other domain module in
 * this project.
 */
import type { CatalogProduct } from "@/lib/domain/catalog";
import { EOF_DEV_IMPORT_SOURCE } from "@/lib/domain/catalog";
import { computeGreekNationalBarcode } from "@/lib/domain/greek-national-barcode";

export interface OfflineIndexEntry {
  id: string;
  eofCode: string | null;
  /** @deprecated Mirrors `medication_catalog_product.gtin`, always null for every real row today — kept only so `offlineIndexEntryToCatalogProduct`'s output shape stays stable. Real GTIN lookups use `gtins` below (GTIN-resolution task spec §5). */
  gtin: string | null;
  /**
   * Every GTIN authoritatively mapped to this product (GTIN-resolution
   * task spec §5/§12) — from `medication_identifier` WHERE
   * `identifier_type = 'GTIN'`, sourced server-side
   * (`lib/catalog/server/offline-index.ts`). Deliberately an array, not a
   * single field: "do not impose a one-to-one package → GTIN
   * relationship" (spec §5). Empty when no GTIN mapping exists yet for
   * this product — that's the honest, expected state until an
   * authoritative GTIN↔EOF source is found and imported (spec §6/§7), not
   * an error.
   */
  gtins: readonly string[];
  /**
   * The full barcode a Greek national (`280`-prefix) product's `eofCode`
   * decodes to, precomputed here so the device never needs to redo
   * check-digit arithmetic just to *display* the barcode — `null` when
   * there's no `eofCode` to derive it from. This is NOT itself a lookup
   * key (lookup happens by `eofCode`, per architecture doc §2.5) — purely
   * a display/reference convenience, matching spec §12's field list.
   */
  barcode: string | null;
  name: string;
  activeIngredient: string | null;
  strengthValue: string | null;
  strengthUnit: string | null;
  form: string | null;
  packSizeValue: string | null;
  packSizeUnit: string | null;
}

/**
 * Adapts a compact offline-index entry back into a `CatalogProduct`-shaped
 * object, purely so the existing scan-candidate UI (`CandidateConfirmation`,
 * which only ever reads `name`/`manufacturer`/`activeIngredient`/
 * `strengthValue`/`strengthUnit`/`form`/`regulatorySource`) can render an
 * offline-resolved candidate without a second, parallel display component.
 * Fields the compact index deliberately never carries (`manufacturer`,
 * per spec §12) are set to `null` — honestly reflecting "not available
 * offline," never fabricated. `regulatorySource` is set to
 * `EOF_DEV_IMPORT_SOURCE` because every offline-index entry originates
 * from real EOF-sourced data by construction (`buildOfflineIndexEntries`
 * already excludes placeholder rows) — never the seed-placeholder notice
 * for something resolved through this path.
 */
export function offlineIndexEntryToCatalogProduct(entry: OfflineIndexEntry): CatalogProduct {
  const now = new Date().toISOString();
  return {
    id: entry.id,
    gtin: entry.gtin,
    eofCode: entry.eofCode,
    name: entry.name,
    nameNormalized: entry.name.toLocaleLowerCase(),
    manufacturer: null,
    activeIngredient: entry.activeIngredient,
    strengthValue: entry.strengthValue,
    strengthUnit: entry.strengthUnit,
    form: entry.form,
    packSizeValue: entry.packSizeValue,
    packSizeUnit: entry.packSizeUnit,
    regulatorySource: EOF_DEV_IMPORT_SOURCE,
    sourceVersion: null,
    sourceLastUpdated: null,
    lifecycleState: "active",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Builds offline-index entries from real catalog products only —
 * explicitly excludes `SEED_PLACEHOLDER_SOURCE` rows (`lib/db/seed.ts`'s
 * fictitious Phase 6 demo data). An index calling itself "Authoritative
 * Greek Medication Catalog" (spec's own required terminology) must never
 * quietly include fabricated placeholder products alongside real EOF
 * data — a device that resolves a scan against fake data would have no
 * way to know the difference.
 *
 * Sorted by `id` for a stable, deterministic serialization — the same
 * catalog state must always produce byte-identical output, which is what
 * makes the manifest's content-hash version meaningful (identical content
 * → identical hash → device correctly detects "nothing changed"). GTIN
 * arrays are also sorted internally for the same determinism reason —
 * `medication_identifier` has no inherent row order.
 *
 * `gtinsByProductId` is a plain `Map`, not a query — this function stays
 * pure/I/O-free (module doc); `lib/catalog/server/offline-index.ts` does
 * the actual `medication_identifier` fetch and passes the merged result in.
 */
export function buildOfflineIndexEntries(products: readonly CatalogProduct[], gtinsByProductId: ReadonlyMap<string, readonly string[]> = new Map()): OfflineIndexEntry[] {
  return products
    .filter((product) => product.regulatorySource === EOF_DEV_IMPORT_SOURCE)
    .map((product) => ({
      id: product.id,
      eofCode: product.eofCode,
      gtin: product.gtin,
      gtins: [...(gtinsByProductId.get(product.id) ?? [])].sort(),
      barcode: product.eofCode ? computeGreekNationalBarcode(product.eofCode) : null,
      name: product.name,
      activeIngredient: product.activeIngredient,
      strengthValue: product.strengthValue,
      strengthUnit: product.strengthUnit,
      form: product.form,
      packSizeValue: product.packSizeValue,
      packSizeUnit: product.packSizeUnit,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
