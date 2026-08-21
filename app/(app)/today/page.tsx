"use client";

import Link from "next/link";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { useMedicationsList } from "@/components/medications/use-medications-list";

/**
 * Today (Phase 3 §2.2). Dose scheduling is Phase 10 — not built yet, so
 * there are never any real dose events to show. Rather than fabricate a
 * populated timeline or a dishonest "all done, well done today!"
 * affirmation (which would imply doses were due and completed), this
 * shows two honest states only:
 *   - no medications at all -> Phase 3's own "empty state, CTA to Add
 *     Medication" (journey 1's onboarding framing).
 *   - has medications, nothing schedulable yet -> a calm, accurate note
 *     that scheduling is coming, not a claim that today is "done."
 */
export default function TodayPage() {
  const profileId = useProfileId();
  const { status, medications } = useMedicationsList(profileId);

  if (status === "loading") {
    return (
      <p role="status" className="p-6 text-sm text-zinc-600 dark:text-zinc-400">
        Φόρτωση…
      </p>
    );
  }

  if (medications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">Καλωσήρθατε στο MedTracking</h1>
        <p className="max-w-sm text-zinc-600 dark:text-zinc-400">Δεν έχετε προσθέσει ακόμα κανένα φάρμακο.</p>
        <Link
          href="/medications/add"
          className="flex min-h-12 items-center justify-center rounded-full bg-zinc-900 px-5 py-3 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Προσθήκη πρώτου φαρμάκου
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">Σήμερα</h1>
      <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
        Δεν υπάρχουν προγραμματισμένες δόσεις για σήμερα — ο προγραμματισμός δόσεων έρχεται σύντομα.
      </p>
      <Link href="/medications" className="min-h-12 text-sm font-medium underline">
        Δείτε τα φάρμακά σας
      </Link>
    </div>
  );
}
