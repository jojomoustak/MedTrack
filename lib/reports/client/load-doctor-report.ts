"use client";

import { getClientDb } from "@/lib/db-client/dexie";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { cacheMissingCatalogProducts } from "@/lib/catalog/client/cache-missing-catalog-products";
import { resolveMedicationDisplayName } from "@/lib/medications/client/use-display-names";
import { resolveMedicationStrength } from "@/lib/medications/client/use-medication-strengths";
import { buildDoctorReport, type DoctorReport, type ReportRange } from "@/lib/reports/doctor-report";

/** What a catalog medicine is called when its product is nowhere on the phone (`use-display-names.ts`'s placeholder). */
const UNKNOWN_CATALOG_NAME = "Φάρμακο από κατάλογο";

/**
 * Reads this profile's report from the phone: works offline, and covers
 * changes not sent yet. A catalog medicine whose name isn't on the phone
 * (right after "Clear data") is asked of the server first, when online.
 */
export async function loadDoctorReport(profileId: string, range: ReportRange, personName: string | null): Promise<DoctorReport> {
  const db = getClientDb();
  const [medications, transactions, profileDoses] = await Promise.all([
    new DexieUserMedicationRepository(db).list(profileId),
    new DexieInventoryTransactionRepository(db).listForProfile(profileId),
    // Every dose, not only scheduled ones: one recorded with no scheduled time is placed by when it was taken.
    db.doseEvent.where("profileId").equals(profileId).toArray(),
  ]);

  const cache = new DexieCatalogCacheRepository(db);
  const offlineIndex = new DexieOfflineIndexRepository(db);
  const unknown = await Promise.all(medications.map(async (med) => ((await resolveMedicationDisplayName(med, cache, offlineIndex)) === null ? med.catalogProductId : null)));
  const toFetch = unknown.filter((id): id is string => id !== null);
  if (toFetch.length > 0) await cacheMissingCatalogProducts(toFetch);

  const names = new Map<string, string>();
  const fullNames = new Map<string, string>();
  const strengths = new Map<string, string | null>();
  await Promise.all(
    medications.map(async (med) => {
      const [name, fullName, strength] = await Promise.all([
        resolveMedicationDisplayName(med, cache, offlineIndex),
        resolveMedicationDisplayName(med, cache, offlineIndex, { full: true }),
        resolveMedicationStrength(med, cache, offlineIndex),
      ]);
      names.set(med.id, name ?? UNKNOWN_CATALOG_NAME);
      fullNames.set(med.id, fullName ?? name ?? UNKNOWN_CATALOG_NAME);
      strengths.set(med.id, strength);
    }),
  );

  return buildDoctorReport({
    personName,
    range,
    now: new Date(),
    medications,
    names,
    fullNames,
    strengths,
    doseEvents: profileDoses,
    transactions,
  });
}
