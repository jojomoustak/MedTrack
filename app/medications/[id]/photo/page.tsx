"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MedicationPhotoAttach } from "@/components/medications/MedicationPhotoAttach";
import { OfflineBanner } from "@/components/sync/OfflineBanner";
import { useCurrentProfile } from "@/lib/auth/client/use-current-profile";

/**
 * Minimal, single-purpose photo surface for one `UserMedication` — NOT a
 * general medication detail/edit page (out of scope for the photo task;
 * see `docs/mobile/phase-3-ux-information-architecture.md` for when a
 * real detail page eventually lands). Reached two ways:
 *   1. Right after "Add Medication" finishes (`?new=1` — the offer is
 *      explicitly optional/skippable here, the medication itself is
 *      already fully saved before this screen ever renders).
 *   2. From the medications list, to view/replace/remove an existing
 *      photo later.
 */
export default function MedicationPhotoPage() {
  const session = useCurrentProfile();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  useEffect(() => {
    if (session.status === "signed-out") router.replace("/login");
  }, [session.status, router]);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <OfflineBanner />
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4">
        <Link href="/medications" aria-label="Πίσω στα φάρμακα" className="min-h-12 text-sm font-medium underline">
          ← Πίσω
        </Link>
        <h1 className="text-xl font-semibold">Φωτογραφία φαρμάκου</h1>
      </div>

      <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
        {isNew && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Το φάρμακο προστέθηκε. Μπορείτε προαιρετικά να προσθέσετε μια φωτογραφία της συσκευασίας — ή να το παραλείψετε τώρα.
          </p>
        )}

        {session.status === "loading" && (
          <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
            Φόρτωση…
          </p>
        )}

        {session.status === "ready" && <MedicationPhotoAttach userMedicationId={params.id} />}

        {isNew && (
          <button
            type="button"
            onClick={() => router.push("/medications")}
            className="min-h-12 rounded-full bg-zinc-900 px-5 py-3 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Ολοκλήρωση
          </button>
        )}
      </div>
    </main>
  );
}
