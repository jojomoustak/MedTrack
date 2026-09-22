"use client";

import { useRef, useState } from "react";
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
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || creating) return;
    playSound("button");
    setCreating(true);
    await createList(newName);
    setNewName("");
    setCreating(false);
  }

  // UX feedback (2026-09-22): every other add-entry-point in the app is a
  // fixed bottom-right FAB (Today/Medications). Lists' own "add" is a
  // same-page form, not a separate route to navigate to, so this FAB
  // brings that form into view and focuses it instead — same landing
  // spot, same visual language, no new route needed.
  function focusCreateForm() {
    playSound("button");
    window.scrollTo({ top: 0, behavior: "smooth" });
    nameInputRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Λίστες</h1>

      <form onSubmit={handleCreate} className="flex gap-2">
        <label htmlFor="new-list-name" className="sr-only">
          Όνομα νέας λίστας
        </label>
        <input
          ref={nameInputRef}
          id="new-list-name"
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Νέα λίστα (π.χ. Φαρμακείο)"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        {/* UX feedback (2026-09-22): at real narrow Android widths (360px)
            this button was being pushed past the right edge by the input's
            flex-1 growth and silently clipped there. shrink-0 keeps it at
            its own natural size regardless of how little room is left. */}
        <button
          type="submit"
          disabled={!newName.trim() || creating}
          className="inline-flex shrink-0 items-center justify-center min-h-12 rounded-full bg-accent-700 px-5 py-2 font-medium text-white disabled:opacity-50 dark:bg-accent-500 dark:text-zinc-950"
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
                className="flex min-h-12 items-center justify-between rounded-xl shadow-sm shadow-zinc-300/40 dark:border dark:border-zinc-800 px-4 py-3 font-medium"
              >
                {list.name}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={focusCreateForm}
        aria-label="Νέα λίστα"
        className="fixed right-4 bottom-20 flex min-h-14 min-w-14 items-center justify-center rounded-full bg-accent-700 px-5 py-4 font-medium text-white shadow-lg dark:bg-accent-500 dark:text-zinc-950"
      >
        + Λίστα
      </button>
    </div>
  );
}
