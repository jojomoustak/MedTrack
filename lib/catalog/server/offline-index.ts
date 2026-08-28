/**
 * Server-side generation of the compact offline index (spec §12/§16) —
 * queries `medication_catalog_product` directly, shapes it via the pure
 * `buildOfflineIndexEntries` (`lib/domain/offline-index.ts`), and adds the
 * manifest layer (content-hash version, record count, generation
 * timestamp) that lets a device answer "do I already have the current
 * version" without downloading the full payload every time.
 *
 * `version` is the SHA-256 of the deterministically-serialized entries
 * themselves, not a separately-tracked counter: identical catalog content
 * always produces the identical hash, which is exactly the comparison a
 * device needs (spec §16: "current version compared with server: same →
 * no download, new → retrieve update") without an extra table or the
 * failure mode of a counter drifting out of sync with actual content.
 */
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { getDb, type Db, type TestableDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { buildOfflineIndexEntries, type OfflineIndexEntry } from "@/lib/domain/offline-index";

export interface OfflineIndexManifest {
  version: string;
  recordCount: number;
  generatedAt: string;
}

export interface OfflineIndex {
  manifest: OfflineIndexManifest;
  entries: OfflineIndexEntry[];
}

export async function generateOfflineIndex(db: Db | TestableDb = getDb()): Promise<OfflineIndex> {
  const products = await db.select().from(schema.medicationCatalogProduct).where(sql`${schema.medicationCatalogProduct.lifecycleState} <> 'discontinued'`);

  // GTIN-resolution task spec §12: merged in JS, not a SQL aggregation —
  // at current volumes (~9,400 products, currently 0 GTIN identifier rows
  // since no authoritative mapping source has been imported yet, spec §6)
  // this is trivial, and keeps `medication_identifier`'s query dead simple
  // rather than needing a `GROUP BY`/`array_agg` that would need revisiting
  // the moment a real bulk import lands. Revisit only if a real
  // measurement says otherwise (spec §14).
  const identifierRows = await db
    .select({ catalogProductId: schema.medicationIdentifier.catalogProductId, identifierValue: schema.medicationIdentifier.identifierValue })
    .from(schema.medicationIdentifier)
    .where(sql`${schema.medicationIdentifier.identifierType} = 'GTIN'`);

  const gtinsByProductId = new Map<string, string[]>();
  for (const row of identifierRows) {
    const existing = gtinsByProductId.get(row.catalogProductId);
    if (existing) existing.push(row.identifierValue);
    else gtinsByProductId.set(row.catalogProductId, [row.identifierValue]);
  }

  const entries = buildOfflineIndexEntries(products, gtinsByProductId);
  const serialized = JSON.stringify(entries);
  const version = createHash("sha256").update(serialized).digest("hex");

  return {
    manifest: {
      version,
      recordCount: entries.length,
      generatedAt: new Date().toISOString(),
    },
    entries,
  };
}

export interface OfflineIndexMeasurement {
  recordCount: number;
  uncompressedBytes: number;
  gzipBytes: number;
  bytesPerRecordUncompressed: number;
  bytesPerRecordGzip: number;
}

/** Real, measured sizes (spec §14: "do not estimate these numbers") — never a hand-computed approximation. */
export function measureOfflineIndex(index: OfflineIndex): OfflineIndexMeasurement {
  const serialized = JSON.stringify(index.entries);
  const uncompressedBytes = Buffer.byteLength(serialized, "utf8");
  const gzipBytes = gzipSync(serialized).length;
  const recordCount = index.entries.length || 1; // avoid divide-by-zero for reporting on an empty index

  return {
    recordCount: index.entries.length,
    uncompressedBytes,
    gzipBytes,
    bytesPerRecordUncompressed: Math.round(uncompressedBytes / recordCount),
    bytesPerRecordGzip: Math.round(gzipBytes / recordCount),
  };
}
