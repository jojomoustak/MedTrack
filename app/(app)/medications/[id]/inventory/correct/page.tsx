"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { InventoryCorrectionForm, type InventoryCorrectionValues } from "@/components/medications/InventoryCorrectionForm";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieInventoryTransactionRepository } from "@/lib/db-client/inventory-transaction-repository";
import { newId } from "@/lib/domain/ids";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

/**
 * Inventory manual correction (Phase 3 §2.5) — an explicit, unattributed
 * ledger entry (`packageId: null`, `transactionType: "manual_correction"`).
 * Deliberately not FIFO-attributed to a specific package the way a
 * `dose_taken` consumption is: a correction is fixing the MEDICATION-wide
 * count (a recount, a lost tablet, a data-entry mistake), not a real dose
 * of a real package, so there's no package to attribute it to.
 */
export default function InventoryCorrectionPage() {
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
        <h1 className="text-xl font-semibold">Διόρθωση αποθέματος</h1>
      </div>

      <InventoryCorrectionForm onSubmit={(values) => void handleSubmit(values)} submitting={submitting} error={error} />
    </div>
  );
}
