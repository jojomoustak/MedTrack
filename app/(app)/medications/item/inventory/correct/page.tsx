"use client";

import { useEffect, useState } from "react";

import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { ButtonLink } from "@/components/ui/Button";
import { InventoryCorrectionForm, type InventoryCorrectionValues } from "@/components/medications/InventoryCorrectionForm";
import { useMedicationInventory } from "@/lib/inventory/client/use-medication-inventory";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import { newId } from "@/lib/domain/ids";
import { playSound } from "@/lib/sound/client/play-sound";
import { MedicationHeader } from "@/components/medications/MedicationHeader";
import { useReturnTo } from "@/lib/navigation/client/use-return-to";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import { usePathId } from "@/lib/navigation/client/use-path-id";
import { FieldsSkeleton, MedicationFormSkeleton } from "@/components/shell/ScreenSkeletons";
import { SkeletonStatus } from "@/components/ui/Skeleton";
import { T, useT } from "@/lib/i18n/client";

/**
 * Inventory manual correction (Phase 3 §2.5) — an explicit, unattributed
 * ledger entry (`packageId: null`, `transactionType: "manual_correction"`).
 * Deliberately not FIFO-attributed to a specific package the way a
 * `dose_taken` consumption is: a correction is fixing the MEDICATION-wide
 * count (a recount, a lost tablet, a data-entry mistake), not a real dose
 * of a real package, so there's no package to attribute it to.
 */
export default function InventoryCorrectionPage() {
  const t = useT();
  const profileId = useProfileId();
  const params = { id: usePathId(2) };
  const returnTo = useReturnTo();
  const [medication, setMedication] = useState<UserMedicationRecord | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inventory = useMedicationInventory(params.id, medication?.lowStockThresholdValue ?? null);

  useEffect(() => {
    let cancelled = false;
    void new DexieUserMedicationRepository().get(params.id).then((med) => {
      if (!cancelled) setMedication(med);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function handleSubmit(values: InventoryCorrectionValues) {
    if (!medication) return;
    setSubmitting(true);
    setError(null);
    try {
      await new DexieInventoryTransactionRepository().createIfMissing({
        id: newId(),
        clientMutationId: newId(),
        profileId,
        userMedicationId: params.id,
        packageId: null,
        transactionType: "manual_correction",
        quantityDelta: String(values.quantityDelta),
        quantityUnit: medication.inventoryUnit,
        doseEventId: null,
        occurredAt: new Date().toISOString(),
        source: "user",
        note: values.note,
      });
      playSound("success");
      returnTo(`/medications/${params.id}`);
    } catch {
      setError(t("Κάτι πήγε στραβά. Δοκιμάστε ξανά."));
    } finally {
      setSubmitting(false);
    }
  }

  if (medication === undefined) {
    return <MedicationFormSkeleton title={t("Διόρθωση αποθέματος")} fields={2} />;
  }

  if (medication === null) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-stone-600"><T>Το φάρμακο δεν βρέθηκε.</T></p>
        <ButtonLink href="/medications" variant="tertiary" className="px-0 underline">
          <T>Πίσω στα φάρμακα</T>
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-5 pt-1 pb-6">
      <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900"><T>Διόρθωση αποθέματος</T></h1>
      <MedicationHeader medication={medication} />

      {inventory.status === "loading" ? (
        <SkeletonStatus label={t("Φόρτωση αποθέματος…")}>
          <FieldsSkeleton count={2} />
        </SkeletonStatus>
      ) : (
        <InventoryCorrectionForm
          currentStock={inventory.currentStock}
          quantityUnit={medication.inventoryUnit}
          onSubmit={(values) => void handleSubmit(values)}
          submitting={submitting}
          error={error}
        />
      )}
    </div>
  );
}
