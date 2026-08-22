"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { createNetworkMonitor } from "@/lib/sync/client/network";

/**
 * Phase 3 §2.9's full account-deletion flow, one client component with an
 * internal step machine (not separate routes per step — the UX spec asks
 * for distinct SCREENS, not necessarily distinct URLs, and a single
 * component makes the non-interruptible in-progress state trivially
 * enforceable: there's no route to navigate away to mid-delete).
 *
 * Steps: explanation -> summary (real counts) -> confirm (typed
 * confirmation, offline-blocked) -> in-progress -> done (forced sign-out).
 */
type Step = "explain" | "summary" | "confirm" | "in-progress" | "done";

interface DeletionSummary {
  medications: number;
  doseEvents: number;
  lists: number;
}

const CONFIRM_PHRASE = "ΔΙΑΓΡΑΦΗ";

export function DeleteAccountFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("explain");
  const [summary, setSummary] = useState<DeletionSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [offline, setOffline] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function goToSummary() {
    setSummaryError(null);
    try {
      const res = await fetch("/api/account/deletion-summary");
      if (!res.ok) throw new Error("summary request failed");
      const data = (await res.json()) as DeletionSummary;
      setSummary(data);
      setStep("summary");
    } catch {
      setSummaryError("Δεν ήταν δυνατή η φόρτωση των στοιχείων σας. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.");
    }
  }

  async function goToConfirm() {
    // Phase 3 §4: Delete Account requires connectivity — checked here,
    // before the confirm screen, not discovered only after the user
    // types the confirmation phrase and taps the final button.
    const monitor = createNetworkMonitor();
    const state = await monitor.checkNow();
    setOffline(state !== "online");
    setStep("confirm");
  }

  async function handleDelete() {
    setSubmitError(null);
    setStep("in-progress");
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) throw new Error("delete request failed");
      setStep("done");
      // Forced sign-out (Phase 3 §2.9 step 5) — the server has already
      // deleted every account_session row as part of the same atomic
      // deletion step, so this is client-side cookie/local-state cleanup,
      // not what actually revokes access.
      await authClient.signOut();
      router.replace("/welcome");
    } catch {
      // Security review (2026-08-22), item 6: NOT connectivity-specific
      // copy — the offline case is already caught earlier (goToConfirm's
      // network check), so a failure reaching this catch is most likely a
      // real server-side failure (see delete-account.ts's ops runbook).
      // Presuming "check your connection" here would misdirect a user
      // away from escalating a genuine failure.
      setSubmitError("Η διαγραφή απέτυχε. Δοκιμάστε ξανά αργότερα ή επικοινωνήστε με την υποστήριξη αν το πρόβλημα επιμένει.");
      setStep("confirm");
    }
  }

  if (step === "explain") {
    return (
      <div className="flex flex-col gap-6 p-6">
        <h1 className="text-xl font-semibold text-red-800 dark:text-red-400">Διαγραφή λογαριασμού</h1>
        <div className="flex flex-col gap-3 text-sm text-zinc-700 dark:text-zinc-300">
          <p>
            Αυτό είναι διαφορετικό από τον καθαρισμό της προσωρινής μνήμης της εφαρμογής. Η διαγραφή είναι{" "}
            <strong>μόνιμη</strong> και πραγματοποιείται στον διακομιστή — δεν αφορά μόνο αυτή τη συσκευή.
          </p>
          <p>Περιλαμβάνει όλα τα δεδομένα του λογαριασμού σας: φάρμακα, προγράμματα λήψης, ιστορικό δόσεων, απόθεμα και λίστες αγορών.</p>
          <p>Μόλις ολοκληρωθεί, αυτά τα δεδομένα δεν μπορούν να ανακτηθούν.</p>
        </div>
        <button
          type="button"
          onClick={goToSummary}
          className="min-h-12 self-start rounded-full bg-red-700 px-5 py-3 font-medium text-white"
        >
          Συνέχεια
        </button>
        {summaryError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {summaryError}
          </p>
        )}
      </div>
    );
  }

  if (step === "summary" && summary) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <h1 className="text-xl font-semibold text-red-800 dark:text-red-400">Αυτά θα χάσετε</h1>
        <ul className="flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <li>{summary.medications} φάρμακα</li>
          <li>{summary.doseEvents} καταγεγραμμένες δόσεις</li>
          <li>{summary.lists} λίστες</li>
        </ul>
        <button
          type="button"
          onClick={goToConfirm}
          className="min-h-12 self-start rounded-full bg-red-700 px-5 py-3 font-medium text-white"
        >
          Συνέχεια
        </button>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="flex flex-col gap-6 p-6">
        <h1 className="text-xl font-semibold text-red-800 dark:text-red-400">Επιβεβαίωση διαγραφής</h1>

        {offline && (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Η διαγραφή λογαριασμού απαιτεί σύνδεση στο διαδίκτυο — δεν είναι τοπική ενέργεια. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.
          </p>
        )}

        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Για να επιβεβαιώσετε, πληκτρολογήστε <strong>{CONFIRM_PHRASE}</strong> παρακάτω.
        </p>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          aria-label={`Πληκτρολογήστε ${CONFIRM_PHRASE} για επιβεβαίωση`}
          className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />

        {submitError && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {submitError}
          </p>
        )}

        <button
          type="button"
          onClick={handleDelete}
          disabled={offline || confirmText !== CONFIRM_PHRASE}
          className="min-h-12 self-start rounded-full bg-red-700 px-5 py-3 font-medium text-white disabled:opacity-50"
        >
          Οριστική διαγραφή λογαριασμού
        </button>
      </div>
    );
  }

  if (step === "in-progress") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-6 text-center" role="status" aria-live="polite">
        <p className="text-lg font-medium">Διαγραφή σε εξέλιξη…</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Μην κλείσετε ή ανανεώσετε αυτή τη σελίδα.</p>
      </div>
    );
  }

  // step === "done"
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-6 text-center" role="status" aria-live="polite">
      <p className="text-lg font-medium">Ο λογαριασμός σας διαγράφηκε.</p>
    </div>
  );
}
