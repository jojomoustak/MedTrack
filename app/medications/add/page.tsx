"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AddMedicationFlow } from "@/components/medications/AddMedicationFlow";
import { OfflineBanner } from "@/components/sync/OfflineBanner";
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
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <OfflineBanner />
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-4">
        <Link href="/medications" aria-label="Πίσω στα φάρμακα" className="min-h-12 text-sm font-medium underline">
          ← Πίσω
        </Link>
        <h1 className="text-xl font-semibold">Προσθήκη φαρμάκου</h1>
      </div>
      {session.status === "loading" && (
        <p role="status" className="px-4 text-sm text-zinc-600 dark:text-zinc-400">
          Φόρτωση…
        </p>
      )}
      {session.status === "ready" && (
        <AddMedicationFlow profileId={session.profileId} onCreated={() => router.push("/medications")} />
      )}
    </main>
  );
}
