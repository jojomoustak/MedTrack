"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AddMedicationFlow } from "@/components/medications/AddMedicationFlow";
import { OfflineBanner } from "@/components/sync/OfflineBanner";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { useCurrentProfile } from "@/lib/auth/client/use-current-profile";

/**
 * Real, reachable route for Phase 3 §3 Journey 1's Add Medication flow.
 * Deliberately OUTSIDE the `(app)` tab-bar shell: Phase 3 §1 — "Add
 * Medication is a task flow, not a destination... opens as a full-screen
 * stacked flow (not a tab)" — no bottom nav while it's open.
 */
export default function AddMedicationPage() {
  const session = useCurrentProfile();
  const router = useRouter();

  useEffect(() => {
    if (session.status === "signed-out") router.replace("/login");
  }, [session.status, router]);

  return (
    <main className="min-h-dvh bg-background pb-8">
      <ScreenHeader />
      <OfflineBanner />
      <h1 className="mx-auto max-w-md px-5 pt-1 pb-5 text-[28px] leading-tight font-bold tracking-tight text-stone-900 dark:text-stone-50">Προσθήκη φαρμάκου</h1>
      {session.status === "loading" && (
        <p role="status" className="px-5 text-sm text-stone-600 dark:text-stone-400">
          Φόρτωση…
        </p>
      )}
      {session.status === "ready" && (
        // Navigates to the optional photo-attach screen rather than
        // straight back to the list — the medication is already fully
        // saved (local-first) by the time `onCreated` fires, so this is a
        // non-blocking next step, not a gate on completing the add flow
        // (that screen's own "Ολοκλήρωση" button is the actual finish).
        <AddMedicationFlow profileId={session.profileId} onCreated={(record) => router.push(`/medications/${record.id}/photo?new=1`)} />
      )}
    </main>
  );
}
