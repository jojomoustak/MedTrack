"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EditMedicationForm, EDIT_MEDICATION_FORM_ID, type EditMedicationValues } from "@/components/medications/EditMedicationForm";
import { DeleteMedicationSection } from "@/components/medications/DeleteMedicationSection";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { recordMedicationInteraction } from "@/lib/medications/client/record-interaction";
import { deleteMedicationWithCascade } from "@/lib/medications/client/delete-medication";
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
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function handleDelete() {
    playSound("button");
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteMedicationWithCascade(profileId, params.id);
      router.push("/medications");
    } catch {
      setDeleteError("Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
      setDeleting(false);
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
        <ButtonLink href="/medications" onClick={() => playSound("button")} variant="tertiary" className="px-0 underline">
          Πίσω στα φάρμακα
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ButtonLink href={`/medications/${params.id}`} onClick={() => playSound("button")} aria-label="Πίσω" variant="tertiary" className="px-0 underline">
            ← Πίσω
          </ButtonLink>
          <h1 className="text-xl font-semibold">Επεξεργασία φαρμάκου</h1>
        </div>
        {/* Design pass (2026-09-28, reference mockup comparison): Save
            moved from the bottom of the form to the header, matching the
            reference — a real HTML `form` attribute submits
            EditMedicationForm from outside it, no ref/JS wiring needed. */}
        <Button form={EDIT_MEDICATION_FORM_ID} type="submit" size="sm" disabled={submitting} aria-busy={submitting}>
          {submitting ? "…" : "Αποθήκευση"}
        </Button>
      </div>

      <EditMedicationForm
        medication={medication}
        displayName={names.get(medication.id) ?? "…"}
        onSubmit={(values) => void handleSubmit(values)}
        error={error}
      />

      <DeleteMedicationSection onConfirmDelete={() => void handleDelete()} deleting={deleting} error={deleteError} />
    </div>
  );
}
