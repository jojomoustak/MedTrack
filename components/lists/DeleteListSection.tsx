"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { playSound } from "@/lib/sound/client/play-sound";

/**
 * Deleting a whole list, at the bottom of its screen (owner-reported
 * 2026-10-17: lists couldn't be deleted). A two-tap confirm, like
 * `DeleteMedicationSection`, rather than an item's undo bar: it takes
 * everything on the list with it, and the screen closes right after.
 */
export function DeleteListSection({
  listName,
  itemCount,
  onConfirmDelete,
  deleting,
  error,
}: {
  listName: string;
  itemCount: number;
  onConfirmDelete: () => void;
  deleting: boolean;
  error: string | null;
}) {
  const [confirming, setConfirming] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus goes to the question that just appeared, on its safe answer (same as `DeleteMedicationSection`).
  useEffect(() => {
    if (confirming) cancelButtonRef.current?.focus();
  }, [confirming]);

  const items = itemCount === 0 ? null : itemCount === 1 ? "το 1 είδος της" : `τα ${itemCount} είδη της`;

  return (
    <section className={confirming ? "surface-card flex flex-col gap-3 p-4" : "flex flex-col"} aria-label="Διαγραφή λίστας">
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
          Διαγραφή λίστας
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[17px] font-semibold text-red-800">Διαγραφή αυτής της λίστας;</p>
          <p className="text-[15px] text-stone-600">
            {items ? `Η λίστα «${listName}» και ${items} θα διαγραφούν` : `Η λίστα «${listName}» θα διαγραφεί`}, και από τις άλλες συσκευές σας.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-700">
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
