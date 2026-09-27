"use client";

import { useState } from "react";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { usePurchaseLists } from "@/lib/lists/client/use-purchase-lists";
import { usePurchaseListSummaries } from "@/lib/lists/client/use-purchase-list-summaries";
import { CardLink } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SegmentedControl, type Segment as SegmentDef } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { playSound } from "@/lib/sound/client/play-sound";

type Segment = "active" | "completed";

const EMPTY_SEGMENT_MESSAGE: Record<Segment, string> = {
  active: "Καμία ενεργή λίστα αυτή τη στιγμή.",
  completed: "Καμία ολοκληρωμένη λίστα ακόμα.",
};

/**
 * Phase 3 §2.7 Lists (purchase lists) — overview + create (Phase 13).
 * Design pass (2026-09-28, reference mockup comparison): added the
 * reference's Active/Completed filter (completion derived from real item
 * state, see usePurchaseListSummaries's own doc) and a per-list item count.
 */
export default function ListsPage() {
  const profileId = useProfileId();
  const { status, lists, createList } = usePurchaseLists(profileId);
  const { status: summaryStatus, summaries } = usePurchaseListSummaries(lists);
  const [segment, setSegment] = useState<Segment>("active");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const segments: SegmentDef<Segment>[] = [
    { value: "active", label: `Ενεργές (${lists.filter((l) => !summaries.get(l.id)?.completed).length})` },
    { value: "completed", label: `Ολοκληρωμένες (${lists.filter((l) => summaries.get(l.id)?.completed).length})` },
  ];
  const visibleLists = lists.filter((l) => (segment === "completed") === Boolean(summaries.get(l.id)?.completed));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    playSound("button");
    setCreating(true);
    await createList(newName);
    setNewName("");
    setCreating(false);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Λίστες</h1>

      <form onSubmit={handleCreate} className="flex gap-2">
        <label htmlFor="new-list-name" className="sr-only">
          Όνομα νέας λίστας
        </label>
        <input
          id="new-list-name"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Νέα λίστα (π.χ. Φαρμακείο)"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-stone-300 px-4 py-2 dark:border-stone-700 dark:bg-stone-900"
        />
        {/* UX feedback (2026-09-22): at real narrow Android widths (360px)
            this button was being pushed past the right edge by the input's
            flex-1 growth and silently clipped there. shrink-0 keeps it at
            its own natural size regardless of how little room is left. */}
        <Button type="submit" disabled={!newName.trim() || creating} className="shrink-0">
          Προσθήκη
        </Button>
      </form>

      {status === "ready" && lists.length > 0 && (
        <SegmentedControl
          segments={segments}
          value={segment}
          onChange={(next) => {
            playSound("button");
            setSegment(next);
          }}
          label="Φίλτρο λιστών"
        />
      )}

      {(status === "loading" || summaryStatus === "loading") && (
        <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
          Φόρτωση…
        </p>
      )}

      {status === "ready" && lists.length === 0 && <EmptyState icon={<EmptyListIcon />} title="Δεν έχετε δημιουργήσει ακόμα καμία λίστα" />}

      {status === "ready" && summaryStatus === "ready" && lists.length > 0 && visibleLists.length === 0 && (
        <EmptyState icon={<EmptyListIcon />} title={EMPTY_SEGMENT_MESSAGE[segment]} />
      )}

      {status === "ready" && summaryStatus === "ready" && visibleLists.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Λίστες αγορών">
          {visibleLists.map((list) => {
            const itemCount = summaries.get(list.id)?.itemCount ?? 0;
            return (
              <li key={list.id}>
                <CardLink href={`/lists/${list.id}`} onClick={() => playSound("button")} className="min-h-12">
                  <div className="flex flex-col">
                    <span className="font-medium">{list.name}</span>
                    <span className="text-sm text-stone-500 dark:text-stone-400">
                      {itemCount} {itemCount === 1 ? "είδος" : "είδη"}
                    </span>
                  </div>
                </CardLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EmptyListIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7h14l-1.2 11.2A2 2 0 0 1 15.8 20H8.2a2 2 0 0 1-2-1.8Z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  );
}
