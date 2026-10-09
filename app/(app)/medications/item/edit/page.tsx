"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EditMedicationForm, EDIT_MEDICATION_FORM_ID, type EditMedicationValues } from "@/components/medications/EditMedicationForm";
import { DeleteMedicationSection } from "@/components/medications/DeleteMedicationSection";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { recordMedicationInteraction } from "@/lib/medications/client/record-interaction";
import { deleteMedicationWithCascade } from "@/lib/medications/client/delete-medication";
import { saveMedicationEdits, type ScheduleEdit } from "@/lib/medications/client/save-medication-edits";
import { refreshNativeReminders } from "@/lib/doses/client/dose-actions";
import { isScheduleCurrent } from "@/lib/medications/schedule-summary";
import { getPreviousPathname } from "@/lib/navigation/client/previous-path";
import { playSound } from "@/lib/sound/client/play-sound";
import { logger } from "@/lib/logging/logger";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import { usePathId } from "@/lib/navigation/client/use-path-id";

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** `/medications/[id]/edit` (Phase 3), laid out after the reference mockup's screen 11 — Save in the header. */
export default function EditMedicationPage() {
  const profileId = useProfileId();
  const params = { id: usePathId(2) };
  const router = useRouter();
  const [medication, setMedication] = useState<UserMedicationRecord | null | undefined>(undefined);
  const [schedule, setSchedule] = useState<MedicationScheduleRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [med, schedules] = await Promise.all([
        new DexieUserMedicationRepository().get(params.id),
        new DexieMedicationScheduleRepository().listByUserMedication(params.id),
      ]);
      if (cancelled) return;
      const today = localToday();
      const current = schedules.filter((s) => isScheduleCurrent(s, today)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setSchedule(current[0] ?? null);
      setMedication(med);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  // Memoized: the name hook re-resolves whenever this array's identity changes.
  const medicationList = useMemo(() => (medication ? [medication] : []), [medication]);
  // The one screen that shows a catalog product's full official description ("FLAGYL CAPS 500MG/CAP BTX30"); everywhere else it's "FLAGYL 500mg".
  const names = useDisplayNames(medicationList, { full: true });
  const detailPath = `/medications/${params.id}`;

  /** Back to the detail screen — popping history when that's where the user came from, so the device back button doesn't return to this form. */
  function returnToDetail() {
    if (getPreviousPathname() === detailPath) router.back();
    else router.replace(detailPath);
  }

  async function handleSubmit(values: EditMedicationValues, scheduleEdit: ScheduleEdit | null) {
    if (!medication) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveMedicationEdits(medication, values, scheduleEdit, {
        medications: new DexieUserMedicationRepository(),
        schedules: new DexieMedicationScheduleRepository(),
        doseEvents: new DexieDoseEventRepository(),
      });
      refreshNativeReminders(profileId);
      recordMedicationInteraction(profileId, params.id, "edited");
      playSound("success");
      returnToDetail();
    } catch (err) {
      logger.warn("medications.edit_save_failed", { message: err instanceof Error ? err.message : String(err) });
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
      router.replace("/medications");
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
    <div className="mx-auto flex max-w-md flex-col gap-6 px-5 pt-1 pb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900 dark:text-stone-50">Επεξεργασία</h1>
        {/* A real HTML `form` attribute submits EditMedicationForm from the header, as in the reference. */}
        <Button form={EDIT_MEDICATION_FORM_ID} type="submit" disabled={submitting} aria-busy={submitting}>
          {submitting ? "Αποθήκευση…" : "Αποθήκευση"}
        </Button>
      </div>

      <EditMedicationForm
        medication={medication}
        displayName={names.get(medication.id) ?? "…"}
        schedule={schedule}
        onSubmit={(values, scheduleEdit) => void handleSubmit(values, scheduleEdit)}
        error={error}
      />

      <DeleteMedicationSection onConfirmDelete={() => void handleDelete()} deleting={deleting} error={deleteError} />
    </div>
  );
}
