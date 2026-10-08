"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client/auth-client";
import { Button } from "@/components/ui/Button";
import { FIELD_INPUT } from "@/components/ui/field-styles";
import { clearCachedProfile } from "@/lib/auth/client/use-current-profile";
import { clearAllLocalProfileData } from "@/lib/db-client/clear-local-profile-data";
import { createNetworkMonitor } from "@/lib/sync/client/network";
import { playSound } from "@/lib/sound/client/play-sound";

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
  const stepContainerRef = useRef<HTMLDivElement>(null);

  // Same reasoning as AddMedicationFlow's identical fix (accessibility
  // audit, Phase 15 Hardening) — this step machine renders a completely
  // different root element per step, so without this, focus is left
  // wherever it was on the PREVIOUS step's now-unmounted content. Matters
  // most here of all this app's flows: this is the account-wide,
  // irreversible GDPR-erasure path (CLAUDE.md rule 9).
  useEffect(() => {
    stepContainerRef.current?.focus();
  }, [step]);

  // UX audit (2026-09-18): none of the three pre-confirmation steps had
  // any back/cancel affordance — the OS/WebView back gesture was the only
  // way out, unlike every other multi-step flow in the app
  // (`AddMedicationFlow`, the schedule builders, `DeleteMedicationSection`'s
  // own two-tap confirm). Worth fixing precisely because this is the
  // highest-stakes, most irreversible flow in the app.
  function handleCancel() {
    playSound("button");
    router.push("/profile");
  }

  async function goToSummary() {
    playSound("button");
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
    playSound("button");
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
      // Security review (2026-08-29): cleared BEFORE the redirect and
      // regardless of signOut()'s own outcome below -- the account (and
      // its data) is already gone server-side at this point, so a stale
      // cached profileId surviving on this device would let a later
      // offline session render a deleted user's local IndexedDB data to
      // whoever opens the app next (see clearCachedProfile's doc comment).
      clearCachedProfile();
      // Offline audit (2026-08-29): unlike plain sign-out, it's always
      // safe to wipe every local table unconditionally here -- the
      // account no longer exists server-side, so nothing still queued
      // locally could ever be delivered anywhere regardless of whether
      // it's kept around (see clearAllLocalProfileData's "IMPORTANT for
      // callers" doc comment for the sign-out case where that's NOT true).
      await clearAllLocalProfileData();
      // Forced sign-out (Phase 3 §2.9 step 5) — the server has already
      // deleted every account_session row as part of the same atomic
      // deletion step, so this is client-side cookie/local-state cleanup,
      // not what actually revokes access.
      try {
        await authClient.signOut();
      } catch {
        // Best-effort -- the deletion itself already succeeded above.
      }
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

  const headerBlock = (
    <>
      <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900 dark:text-stone-50">Διαγραφή λογαριασμού</h1>
      <div className="flex flex-col items-center gap-4 text-center">
        <span aria-hidden="true" className="flex size-24 items-center justify-center rounded-3xl bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M12 3.5 2.5 20h19Z" />
            <path d="M12 10v4.5" strokeLinecap="round" />
            <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <div>
          <p className="text-[19px] leading-snug font-bold text-stone-900 dark:text-stone-50">Θα διαγραφούν οριστικά ο λογαριασμός σας και όλα τα δεδομένα σας.</p>
          <p className="mt-1 text-[15px] text-stone-600 dark:text-stone-400">Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.</p>
        </div>
      </div>
    </>
  );

  /** What goes — the reference's red list; with real counts once they've been fetched. */
  function dangerList(counts: DeletionSummary | null) {
    const rows = [
      { label: "Όλα τα φάρμακα και τα προγράμματά τους", count: counts ? `${counts.medications}` : null },
      { label: "Όλο το ιστορικό δόσεων και το απόθεμα", count: counts ? `${counts.doseEvents} δόσεις` : null },
      { label: "Οι λίστες αγορών", count: counts ? `${counts.lists}` : null },
      { label: "Τα στοιχεία του προφίλ σας", count: null },
    ];
    return (
      <ul className="flex flex-col gap-3 rounded-2xl bg-red-50 p-4 dark:bg-red-950/50" aria-label="Τι θα διαγραφεί">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-3 text-[15px] font-medium text-red-800 dark:text-red-300">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
              <rect x="3.5" y="3.5" width="13" height="13" rx="3" />
              <path d="M7 10h6" strokeLinecap="round" />
            </svg>
            <span className="flex-1">{row.label}</span>
            {row.count && <span className="font-bold tabular-nums">{row.count}</span>}
          </li>
        ))}
      </ul>
    );
  }

  const actions = (onContinue: () => void, continueLabel: string, disabled = false) => (
    <div className="flex flex-col gap-2">
      <Button variant="danger" size="lg" fullWidth onClick={onContinue} disabled={disabled}>
        {continueLabel}
      </Button>
      <Button variant="secondary" size="lg" fullWidth onClick={handleCancel}>
        Άκυρο
      </Button>
    </div>
  );

  if (step === "explain") {
    return (
      <div ref={stepContainerRef} tabIndex={-1} className="flex flex-col gap-6 px-5 pt-1 pb-6 outline-none">
        {headerBlock}
        {dangerList(null)}
        {/* CLAUDE.md rule 9: this is not clearing the app's storage. */}
        <p className="text-[15px] text-stone-600 dark:text-stone-400">
          Αυτό είναι διαφορετικό από τον καθαρισμό της προσωρινής μνήμης της εφαρμογής: η διαγραφή γίνεται στον διακομιστή και αφορά όλες τις συσκευές σας,
          όχι μόνο αυτή.
        </p>
        {summaryError && (
          <p role="alert" className="text-[15px] font-medium text-red-700 dark:text-red-400">
            {summaryError}
          </p>
        )}
        {actions(goToSummary, "Συνέχεια")}
      </div>
    );
  }

  if (step === "summary" && summary) {
    return (
      <div ref={stepContainerRef} tabIndex={-1} className="flex flex-col gap-6 px-5 pt-1 pb-6 outline-none">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900 dark:text-stone-50">Αυτά θα χάσετε</h1>
        {dangerList(summary)}
        {actions(goToConfirm, "Συνέχεια")}
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div ref={stepContainerRef} tabIndex={-1} className="flex flex-col gap-6 px-5 pt-1 pb-6 outline-none">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900 dark:text-stone-50">Επιβεβαίωση διαγραφής</h1>

        {offline && (
          <p role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-[15px] text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Η διαγραφή λογαριασμού απαιτεί σύνδεση στο διαδίκτυο — δεν είναι τοπική ενέργεια. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.
          </p>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-[17px] text-stone-800 dark:text-stone-200">
            Για να επιβεβαιώσετε, πληκτρολογήστε <strong>{CONFIRM_PHRASE}</strong>.
          </span>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            aria-label={`Πληκτρολογήστε ${CONFIRM_PHRASE} για επιβεβαίωση`}
            autoCapitalize="characters"
            className={`${FIELD_INPUT} pr-4`}
          />
        </label>

        {submitError && (
          <p role="alert" className="text-[15px] font-medium text-red-700 dark:text-red-400">
            {submitError}
          </p>
        )}

        {actions(handleDelete, "Οριστική διαγραφή λογαριασμού", offline || confirmText !== CONFIRM_PHRASE)}
      </div>
    );
  }

  if (step === "in-progress") {
    return (
      <div ref={stepContainerRef} tabIndex={-1} className="flex flex-col items-center justify-center gap-4 px-5 py-16 text-center outline-none" role="status" aria-live="polite">
        <span aria-hidden="true" className="size-10 animate-spin rounded-full border-4 border-red-200 border-t-red-600" />
        <p className="text-[19px] font-semibold">Διαγραφή σε εξέλιξη…</p>
        <p className="text-[15px] text-stone-600 dark:text-stone-400">Μην κλείσετε ή ανανεώσετε αυτή τη σελίδα.</p>
      </div>
    );
  }

  // step === "done"
  return (
    <div ref={stepContainerRef} tabIndex={-1} className="flex flex-col items-center justify-center gap-4 px-5 py-16 text-center outline-none" role="status" aria-live="polite">
      <p className="text-[19px] font-semibold">Ο λογαριασμός σας διαγράφηκε.</p>
    </div>
  );
}
