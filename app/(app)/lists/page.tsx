"use client";

import { useState } from "react";
import Link from "next/link";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { usePurchaseLists } from "@/lib/lists/client/use-purchase-lists";
import { playSound } from "@/lib/sound/client/play-sound";

/** Phase 3 §2.7 Lists (purchase lists) — overview + create (Phase 13). */
export default function ListsPage() {
  const profileId = useProfileId();
  const { status, lists, createList } = usePurchaseLists(profileId);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

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
        <button
          type="submit"
          disabled={!newName.trim() || creating}
          className="inline-flex shrink-0 items-center justify-center min-h-12 rounded-full bg-accent-700 px-5 py-2 font-medium text-white transition-transform duration-150 active:scale-95 disabled:opacity-50 disabled:active:scale-100 dark:bg-accent-500 dark:text-stone-950"
        >
          Προσθήκη
        </button>
      </form>

      {status === "loading" && (
        <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
          Φόρτωση…
        </p>
      )}

      {status === "ready" && lists.length === 0 && (
        <p className="p-8 text-center text-stone-600 dark:text-stone-400">Δεν έχετε δημιουργήσει ακόμα καμία λίστα.</p>
      )}

      {status === "ready" && lists.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Λίστες αγορών">
          {lists.map((list) => (
            <li key={list.id}>
              <Link
                href={`/lists/${list.id}`}
                onClick={() => playSound("button")}
                className="flex min-h-12 items-center justify-between rounded-xl shadow-sm shadow-stone-300/40 transition-transform duration-150 active:scale-[0.98] dark:border dark:border-stone-800 px-4 py-3 font-medium"
              >
                {list.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
