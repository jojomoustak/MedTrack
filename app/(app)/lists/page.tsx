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
          className="min-h-12 flex-1 rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={!newName.trim() || creating}
          className="min-h-12 rounded-full bg-zinc-900 px-5 py-2 font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          Προσθήκη
        </button>
      </form>

      {status === "loading" && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Φόρτωση…
        </p>
      )}

      {status === "ready" && lists.length === 0 && (
        <p className="p-8 text-center text-zinc-600 dark:text-zinc-400">Δεν έχετε δημιουργήσει ακόμα καμία λίστα.</p>
      )}

      {status === "ready" && lists.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Λίστες αγορών">
          {lists.map((list) => (
            <li key={list.id}>
              <Link
                href={`/lists/${list.id}`}
                onClick={() => playSound("button")}
                className="flex min-h-12 items-center justify-between rounded-xl border border-zinc-200 px-4 py-3 font-medium dark:border-zinc-800"
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
