"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { AddPackageForm, type AddPackageValues } from "@/components/medications/AddPackageForm";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationPackageRepository } from "@/lib/db-client/medication-package-repository";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import { newId } from "@/lib/domain/ids";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

export default function AddPackagePage() {
  const profileId = useProfileId();
  const params = useParams<{ id: string }>();
  const router = useRouter();
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

      router.push(`/medications/${params.id}`);
    } catch {
      setError("Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
    } finally {
      setSubmitting(false);
    }
  }

  if (medication === undefined) {
    return (
      <p role="status" className="p-6 text-sm text-zinc-600 dark:text-zinc-400">
        Φόρτωση…
      </p>
    );
  }

  if (medication === null) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-zinc-600 dark:text-zinc-400">Το φάρμακο δεν βρέθηκε.</p>
        <Link href="/medications" className="min-h-12 text-sm font-medium underline">
          Πίσω στα φάρμακα
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <Link href={`/medications/${params.id}`} aria-label="Πίσω" className="min-h-12 text-sm font-medium underline">
          ← Πίσω
        </Link>
        <h1 className="text-xl font-semibold">Προσθήκη συσκευασίας</h1>
      </div>

      <AddPackageForm defaultUnit={medication.inventoryUnit} onSubmit={(values) => void handleSubmit(values)} submitting={submitting} error={error} />
    </div>
  );
}
