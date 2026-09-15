"use client";

import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sound/client/play-sound";

/**
 * "Danger zone" delete action for `/medications/[id]/edit` — a two-tap
 * confirm (no typed-confirmation phrase, unlike `DeleteAccountFlow`'s
 * full account/health-data erasure: this is a single medication, not the
 * account-wide GDPR erasure workflow CLAUDE.md rule 9 reserves that
 * heavier UX for) so a single mis-tap can't delete a medication outright.
 */
export function DeleteMedicationSection({
  onConfirmDelete,
  deleting,
  error,
}: {
  onConfirmDelete: () => void;
  deleting: boolean;
  error: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Moves focus into the newly-revealed confirm block so a screen-reader
  // or keyboard user is actually taken to it — without this, expanding
  // the block leaves focus (and the assistive-tech cursor) wherever it
  // was, with no indication anything changed (accessibility audit,
  // Phase 15 Hardening). "Άκυρο" rather than the destructive confirm
  // button, matching this app's "safer default" convention elsewhere.
  useEffect(() => {
    if (confirming) cancelButtonRef.current?.focus();
  }, [confirming]);

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-red-300 p-4 dark:border-red-900">
      <h2 className="text-sm font-medium text-red-800 dark:text-red-400">Μη αναστρέψιμη ενέργεια</h2>

      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            playSound("button");
            setConfirming(true);
          }}
          aria-expanded={confirming}
          className="min-h-12 rounded-full border border-red-300 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:text-red-400"
        >
          Διαγραφή φαρμάκου
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Το φάρμακο θα σταματήσει να εμφανίζεται και οι υπενθυμίσεις του θα ακυρωθούν. Το ιστορικό δόσεων και αποθέματος διατηρείται.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={() => {
                playSound("button");
                setConfirming(false);
              }}
              disabled={deleting}
              className="min-h-12 flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
            >
              Άκυρο
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={deleting}
              aria-busy={deleting}
              className="min-h-12 flex-1 rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {deleting ? "Διαγραφή…" : "Ναι, διαγραφή"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
