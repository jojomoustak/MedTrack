"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { usePurchaseListItems } from "@/lib/lists/client/use-purchase-list-items";
import { DexiePurchaseListRepository } from "@/lib/db-client/purchase-list-repository";
import type { PurchaseListRecord, PurchaseListItemRecord } from "@/lib/domain/entities";
import { formatCents, fromDecimalEuros, toCents } from "@/lib/domain/money";
import { playSound } from "@/lib/sound/client/play-sound";

/** Phase 3 §2.7 Lists — one list's items: add, mark purchased/pending, delete (Phase 13). */
export default function PurchaseListDetailPage() {
  const params = useParams<{ id: string }>();
  const listId = params.id;
  const profileId = useProfileId();
  const [list, setList] = useState<PurchaseListRecord | null>(null);
  const { status, items, addItem, markPurchased, markPending, deleteItem } = usePurchaseListItems(listId, profileId);

  const [label, setLabel] = useState("");
  const [priceEuros, setPriceEuros] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void new DexiePurchaseListRepository().get(listId).then((l) => {
      if (!cancelled) setList(l);
    });
    return () => {
      cancelled = true;
    };
  }, [listId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || adding) return;
    playSound("button");
    setAdding(true);
    let estimatedUnitPriceCents: number | null = null;
    if (priceEuros.trim()) {
      try {
        estimatedUnitPriceCents = fromDecimalEuros(priceEuros.trim());
      } catch {
        estimatedUnitPriceCents = null;
      }
    }
    await addItem({ label: label.trim(), estimatedUnitPriceCents });
    setLabel("");
    setPriceEuros("");
    setAdding(false);
  }

  const pending = items.filter((i) => i.status === "pending");
  const purchased = items.filter((i) => i.status === "purchased");

  function itemPriceLabel(item: PurchaseListItemRecord): string | null {
    const cents = item.status === "purchased" ? (item.actualPaidPriceCents ?? item.estimatedUnitPriceCents) : item.estimatedUnitPriceCents;
    if (cents === null) return null;
    return formatCents(toCents(cents), item.currency);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Link href="/lists" onClick={() => playSound("button")} className="text-sm font-medium underline">
          Λίστες
        </Link>
        <span className="text-zinc-400">/</span>
        <h1 className="text-xl font-semibold">{list?.name ?? "…"}</h1>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <label htmlFor="new-item-label" className="sr-only">
          Νέο είδος
        </label>
        <input
          id="new-item-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Νέο είδος (π.χ. Βιταμίνη D)"
          className="min-h-12 rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div className="flex gap-2">
          <label htmlFor="new-item-price" className="sr-only">
            Εκτιμώμενη τιμή (€)
          </label>
          <input
            id="new-item-price"
            type="text"
            inputMode="decimal"
            value={priceEuros}
            onChange={(e) => setPriceEuros(e.target.value)}
            placeholder="Τιμή € (προαιρετικό)"
            className="min-h-12 flex-1 rounded-xl border border-zinc-300 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={!label.trim() || adding}
            className="min-h-12 rounded-full bg-zinc-900 px-5 py-2 font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            Προσθήκη
          </button>
        </div>
      </form>

      {status === "loading" && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          Φόρτωση…
        </p>
      )}

      {status === "ready" && items.length === 0 && <p className="p-8 text-center text-zinc-600 dark:text-zinc-400">Η λίστα είναι άδεια.</p>}

      {status === "ready" && pending.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Προς αγορά</h2>
          <ul className="flex flex-col gap-2" aria-label="Προς αγορά">
            {pending.map((item) => (
              <li key={item.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    playSound("success");
                    void markPurchased(item.id);
                  }}
                  aria-label={`Σήμανση "${item.label}" ως αγορασμένο`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-zinc-400 dark:border-zinc-600"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.label}</p>
                  {itemPriceLabel(item) && <p className="text-sm text-zinc-600 dark:text-zinc-400">{itemPriceLabel(item)}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playSound("button");
                    void deleteItem(item.id);
                  }}
                  aria-label={`Διαγραφή "${item.label}"`}
                  className="min-h-12 min-w-12 text-sm font-medium text-red-700 dark:text-red-400"
                >
                  Διαγραφή
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status === "ready" && purchased.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Αγορασμένα</h2>
          <ul className="flex flex-col gap-2" aria-label="Αγορασμένα">
            {purchased.map((item) => (
              <li key={item.id} className="flex min-h-12 items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 opacity-70 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    playSound("button");
                    void markPending(item.id);
                  }}
                  aria-label={`Αναίρεση αγοράς "${item.label}"`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                >
                  ✓
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-medium line-through">{item.label}</p>
                  {itemPriceLabel(item) && <p className="text-sm text-zinc-600 dark:text-zinc-400">{itemPriceLabel(item)}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    playSound("button");
                    void deleteItem(item.id);
                  }}
                  aria-label={`Διαγραφή "${item.label}"`}
                  className="min-h-12 min-w-12 text-sm font-medium text-red-700 dark:text-red-400"
                >
                  Διαγραφή
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
