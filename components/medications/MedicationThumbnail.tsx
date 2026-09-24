"use client";

import { useMedicationPhotoThumbnail } from "@/lib/medications/client/use-medication-photo-thumbnail";

/** Renders nothing when the medication has no uploaded photo — the list row's layout is unaffected either way. */
export function MedicationThumbnail({ userMedicationId }: { userMedicationId: string }) {
  const url = useMedicationPhotoThumbnail(userMedicationId);
  if (!url) return null;

  return <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />;
}
