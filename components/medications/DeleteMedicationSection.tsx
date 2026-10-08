"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
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
    <section className={confirming ? "surface-card flex flex-col gap-3 p-4" : "flex flex-col"} aria-label="Διαγραφή φαρμάκου">

      {!confirming ? (
        <Button
          variant="danger-outline"
          onClick={() => {
            playSound("button");
            setConfirming(true);
          }}
          aria-expanded={confirming}
          size="lg"
          fullWidth
        >
          Διαγραφή φαρμάκου
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[17px] font-semibold text-red-800 dark:text-red-400">Διαγραφή αυτού του φαρμάκου;</p>
          <p className="text-[15px] text-stone-600 dark:text-stone-400">
            Το φάρμακο θα σταματήσει να εμφανίζεται και οι υπενθυμίσεις του θα ακυρωθούν. Το ιστορικό δόσεων και αποθέματος διατηρείται.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              ref={cancelButtonRef}
              variant="secondary"
              onClick={() => {
                playSound("button");
                setConfirming(false);
              }}
              disabled={deleting}
              size="lg"
              className="flex-1"
            >
              Άκυρο
            </Button>
            <Button variant="danger" onClick={onConfirmDelete} disabled={deleting} aria-busy={deleting} size="lg" className="flex-1">
              {deleting ? "Διαγραφή…" : "Ναι, διαγραφή"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
