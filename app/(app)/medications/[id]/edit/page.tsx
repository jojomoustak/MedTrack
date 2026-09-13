"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { EditMedicationForm, type EditMedicationValues } from "@/components/medications/EditMedicationForm";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { recordMedicationInteraction } from "@/lib/medications/client/record-interaction";
import { newId } from "@/lib/domain/ids";
import { playSound } from "@/lib/sound/client/play-sound";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

/** `/medications/[id]/edit` — the medication-edit screen (Phase 3, built 2026-09-13). */
export default function EditMedicationPage() {
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

  const names = useDisplayNames(medication ? [medication] : []);

  async function handleSubmit(values: EditMedicationValues) {
    setSubmitting(true);
    setError(null);
    try {
      const repo = new DexieUserMedicationRepository();
      await repo.update(params.id, values, newId());
      recordMedicationInteraction(profileId, params.id, "edited");
      playSound("success");
      router.push(`/medications/${params.id}`);
    } catch {
      setError("Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
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
        <h1 className="text-xl font-semibold">Επεξεργασία φαρμάκου</h1>
      </div>

      <EditMedicationForm
        medication={medication}
        displayName={names.get(medication.id) ?? "…"}
        onSubmit={(values) => void handleSubmit(values)}
        submitting={submitting}
        error={error}
      />
    </div>
  );
}
