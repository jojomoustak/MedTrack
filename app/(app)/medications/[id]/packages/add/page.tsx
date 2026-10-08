"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { ButtonLink } from "@/components/ui/Button";
import { AddPackageForm, type AddPackageValues } from "@/components/medications/AddPackageForm";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationPackageRepository } from "@/lib/db-client/medication-package-repository";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import { newId } from "@/lib/domain/ids";
import { playSound } from "@/lib/sound/client/play-sound";
import { MedicationHeader } from "@/components/medications/MedicationHeader";
import { useReturnTo } from "@/lib/navigation/client/use-return-to";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

export default function AddPackagePage() {
  const profileId = useProfileId();
  const params = useParams<{ id: string }>();
  const returnTo = useReturnTo();
  const [medication, setMedication] = useState<UserMedicationRecord | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void new DexieUserMedicationRepository().get(params.id).then((med) => {
      if (!cancelled) setMedication(med);
    });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function handleSubmit(values: AddPackageValues) {
    setSubmitting(true);
    setError(null);
    try {
      const packageRepo = new DexieMedicationPackageRepository();
      const pkg = await packageRepo.create({
        id: newId(),
        clientMutationId: newId(),
        profileId,
        userMedicationId: params.id,
        source: "manual",
        gtin: null,
        batchNumber: values.batchNumber,
        serialNumber: null,
        expiryDate: values.expiryDate,
        receivedDate: new Date().toISOString().slice(0, 10),
        initialQuantityValue: String(values.initialQuantityValue),
        quantityUnit: values.quantityUnit,
      });

      if (values.openNow) {
        const now = new Date().toISOString();
        await packageRepo.update(pkg.id, { status: "opened", openedAt: now }, newId());
        await new DexieInventoryTransactionRepository().createIfMissing({
          id: newId(),
          clientMutationId: newId(),
          profileId,
          userMedicationId: params.id,
          packageId: pkg.id,
          transactionType: "package_opened",
          quantityDelta: pkg.initialQuantityValue,
          quantityUnit: pkg.quantityUnit,
          doseEventId: null,
          occurredAt: now,
          source: "user",
          note: null,
        });
      }

      playSound("success");
      returnTo(`/medications/${params.id}`);
    } catch {
      setError("Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
    } finally {
      setSubmitting(false);
    }
  }

  if (medication === undefined) {
    return (
      <p role="status" className="p-6 text-sm text-stone-600 dark:text-stone-400">
        Φόρτωση…
      </p>
    );
  }

  if (medication === null) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-stone-600 dark:text-stone-400">Το φάρμακο δεν βρέθηκε.</p>
        <ButtonLink href="/medications" variant="tertiary" className="px-0 underline">
          Πίσω στα φάρμακα
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-5 pt-1 pb-6">
      <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900 dark:text-stone-50">Νέα συσκευασία</h1>
      <MedicationHeader medication={medication} />

      <AddPackageForm defaultUnit={medication.inventoryUnit} onSubmit={(values) => void handleSubmit(values)} submitting={submitting} error={error} />
    </div>
  );
}
