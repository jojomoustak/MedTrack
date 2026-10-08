"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { usePurchaseLists } from "@/lib/lists/client/use-purchase-lists";
import { usePurchaseListSummaries } from "@/lib/lists/client/use-purchase-list-summaries";
import { Button } from "@/components/ui/Button";
import { ChevronIcon } from "@/components/ui/ChevronIcon";
import { SegmentedControl, type Segment as SegmentDef } from "@/components/ui/SegmentedControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { FIELD_INPUT } from "@/components/ui/field-styles";
import { playSound } from "@/lib/sound/client/play-sound";

type Segment = "active" | "completed";

const EMPTY_SEGMENT_MESSAGE: Record<Segment, string> = {
  active: "Καμία ενεργή λίστα αυτή τη στιγμή.",
  completed: "Καμία ολοκληρωμένη λίστα ακόμα.",
};

/** The leading square on a list row: ticked once everything on the list is bought (completion is derived from its items — `usePurchaseListSummaries`). Display only. */
function CompletionSquare({ completed }: { completed: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-7 shrink-0 items-center justify-center rounded-lg border-2 ${
        completed ? "border-accent-700 bg-accent-700 text-white dark:border-accent-500 dark:bg-accent-500 dark:text-stone-950" : "border-stone-400 dark:border-stone-500"
      }`}
    >
      {completed && (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 12.5 10 17l9-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/**
 * Phase 3 §2.7 Lists (purchase lists), laid out after the reference mockup's
 * screen 19: title with "+ Νέα", Active / Completed, and one row per list.
 * "+ Νέα" opens an inline name field rather than keeping one always on
 * screen.
 */
export default function ListsPage() {
  const profileId = useProfileId();
  const { status, lists, createList } = usePurchaseLists(profileId);
  const { status: summaryStatus, summaries } = usePurchaseListSummaries(lists);
  const [segment, setSegment] = useState<Segment>("active");
  const [composing, setComposing] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (composing) nameInputRef.current?.focus();
  }, [composing]);

  const activeCount = lists.filter((l) => !summaries.get(l.id)?.completed).length;
  const segments: SegmentDef<Segment>[] = [
    { value: "active", label: `Ενεργές (${activeCount})` },
    { value: "completed", label: `Ολοκληρωμένες (${lists.length - activeCount})` },
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
    setComposing(false);
    setSegment("active");
  }

  return (
    <div className="flex flex-col gap-5 px-5 pt-1 pb-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900 dark:text-stone-50">Λίστες αγορών</h1>
        {!composing && (
          <Button
            onClick={() => {
              playSound("button");
              setComposing(true);
            }}
          >
            <PlusIcon />
            Νέα
          </Button>
        )}
      </div>

      {composing && (
        <form onSubmit={handleCreate} className="surface-card flex flex-col gap-3 p-4">
          <label htmlFor="new-list-name" className="text-[17px] font-semibold text-stone-800 dark:text-stone-200">
            Όνομα νέας λίστας
          </label>
          <input
            id="new-list-name"
            ref={nameInputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="π.χ. Φαρμακείο"
            className={`${FIELD_INPUT} pr-4`}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => {
                playSound("button");
                setComposing(false);
                setNewName("");
              }}
            >
              Ακύρωση
            </Button>
            <Button type="submit" size="lg" className="flex-1" disabled={!newName.trim() || creating}>
              Δημιουργία
            </Button>
          </div>
        </form>
      )}

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

      {status === "ready" && lists.length === 0 && !composing && <EmptyState icon={<EmptyListIcon />} title="Δεν έχετε δημιουργήσει ακόμα καμία λίστα" />}

      {status === "ready" && summaryStatus === "ready" && lists.length > 0 && visibleLists.length === 0 && (
        <EmptyState icon={<EmptyListIcon />} title={EMPTY_SEGMENT_MESSAGE[segment]} />
      )}

      {status === "ready" && summaryStatus === "ready" && visibleLists.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Λίστες αγορών">
          {visibleLists.map((list) => {
            const summary = summaries.get(list.id);
            const itemCount = summary?.itemCount ?? 0;
            return (
              <li key={list.id}>
                <Link
                  href={`/lists/${list.id}`}
                  onClick={() => playSound("button")}
                  className="surface-card flex min-h-20 items-center gap-4 px-4 py-3 transition-transform duration-150 active:scale-[0.99]"
                >
                  <CompletionSquare completed={Boolean(summary?.completed)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[19px] font-bold text-stone-900 dark:text-stone-50">{list.name}</span>
                    <span className="block text-base text-stone-600 dark:text-stone-400">
                      {itemCount} {itemCount === 1 ? "είδος" : "είδη"}
                    </span>
                  </span>
                  <ChevronIcon />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.6">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
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
