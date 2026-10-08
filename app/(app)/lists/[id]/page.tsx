"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { usePurchaseListItems } from "@/lib/lists/client/use-purchase-list-items";
import { useMedicationsList } from "@/components/medications/use-medications-list";
import { useDisplayNames } from "@/lib/medications/client/use-display-names";
import { useMedicationStrengths } from "@/lib/medications/client/use-medication-strengths";
import { DexiePurchaseListRepository } from "@/lib/db-client/purchase-list-repository";
import { UndoableDeleteButton } from "@/components/lists/UndoableDeleteButton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FIELD_INPUT, FIELD_LABEL } from "@/components/ui/field-styles";
import { dosageFormLabel } from "@/lib/medications/labels";
import type { PurchaseListRecord, PurchaseListItemRecord } from "@/lib/domain/entities";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import { formatCents, fromDecimalEuros, toCents } from "@/lib/domain/money";
import { playSound } from "@/lib/sound/client/play-sound";

const MAX_SUGGESTIONS = 6;

function CheckSquare({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-7 items-center justify-center rounded-lg border-2 ${
        checked ? "border-accent-700 bg-accent-700 text-white dark:border-accent-500 dark:bg-accent-500 dark:text-stone-950" : "border-stone-400 bg-white dark:border-stone-500 dark:bg-stone-900"
      }`}
    >
      {checked && (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 12.5 10 17l9-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="currentColor">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/**
 * One item: the square marks it bought (or un-bought); the "⋯" button
 * opens its less common actions inside the row, so the row itself stays
 * as simple as the reference's.
 */
function ItemRow({
  item,
  name,
  detail,
  onToggle,
  toggleLabel,
  actions,
  footer,
}: {
  item: PurchaseListItemRecord;
  name: string;
  detail: string | null;
  onToggle?: () => void;
  toggleLabel?: string;
  actions: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const purchased = item.status === "purchased";
  const removed = item.status === "removed";
  return (
    <li className={`flex flex-col ${removed ? "rounded-2xl border-2 border-dashed border-stone-300 opacity-70 dark:border-stone-700" : "surface-card"}`}>
      <div className="flex min-h-19 items-center gap-2 py-2 pr-1 pl-1.5">
        {onToggle ? (
          <button type="button" onClick={onToggle} aria-label={toggleLabel} className="flex size-12 shrink-0 items-center justify-center rounded-xl active:scale-95">
            <CheckSquare checked={purchased} />
          </button>
        ) : (
          <span className="size-3 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[17px] font-bold ${purchased ? "text-stone-500 line-through dark:text-stone-400" : "text-stone-900 dark:text-stone-50"}`}>{name}</p>
          {detail && <p className="truncate text-[15px] text-stone-600 dark:text-stone-400">{detail}</p>}
          {footer}
        </div>
        <button
          type="button"
          onClick={() => {
            playSound("button");
            setOpen((o) => !o);
          }}
          aria-expanded={open}
          aria-label={`Επιλογές για "${name}"`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-stone-500 active:bg-stone-100 dark:active:bg-stone-800"
        >
          <MoreIcon />
        </button>
      </div>
      {open && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 px-3 py-2 dark:border-stone-800">{actions}</div>}
    </li>
  );
}

/**
 * Phase 3 §2.7 Lists — one list's items (reference mockup, screen 20). Add
 * free text, or tap one of your medications to add it linked; tick items
 * off as bought; "no longer needed" and delete (with undo) sit behind each
 * row's "⋯". A bought medication offers "add to stock" (Phase 13).
 */
export default function PurchaseListDetailPage() {
  const params = useParams<{ id: string }>();
  const listId = params.id;
  const profileId = useProfileId();
  const [list, setList] = useState<PurchaseListRecord | null>(null);
  const { status, items, addItem, markPurchased, markPending, markRemoved, deleteItem } = usePurchaseListItems(listId, profileId);
  const { medications } = useMedicationsList(profileId);
  const names = useDisplayNames(medications);
  const strengths = useMedicationStrengths(medications);

  const [label, setLabel] = useState("");
  const [showPrice, setShowPrice] = useState(false);
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

  const medicationsById = new Map<string, UserMedicationRecord>(medications.map((m) => [m.id, m]));

  function parsedPriceCents(): number | null {
    if (!priceEuros.trim()) return null;
    try {
      return fromDecimalEuros(priceEuros.trim());
    } catch {
      return null;
    }
  }

  async function add(input: { label: string } | { userMedicationId: string }) {
    if (adding) return;
    playSound("button");
    setAdding(true);
    await addItem({ ...input, estimatedUnitPriceCents: parsedPriceCents() });
    setLabel("");
    setPriceEuros("");
    setShowPrice(false);
    setAdding(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    void add({ label: label.trim() });
  }

  function medicationTitle(id: string): string {
    const name = names.get(id) ?? "…";
    const strength = strengths.get(id);
    return strength ? `${name} ${strength}` : name;
  }

  function itemDisplayName(item: PurchaseListItemRecord): string {
    if (item.userMedicationId) return medicationTitle(item.userMedicationId);
    return item.label ?? "…";
  }

  function itemDetail(item: PurchaseListItemRecord): string | null {
    const med = item.userMedicationId ? medicationsById.get(item.userMedicationId) : undefined;
    const form = med ? dosageFormLabel(med.customForm ?? med.inventoryUnit) : null;
    const cents = item.status === "purchased" ? (item.actualPaidPriceCents ?? item.estimatedUnitPriceCents) : item.estimatedUnitPriceCents;
    const price = cents === null ? null : formatCents(toCents(cents), item.currency);
    return [form, price].filter(Boolean).join(" • ") || null;
  }

  const pending = items.filter((i) => i.status === "pending");
  const purchased = items.filter((i) => i.status === "purchased");
  const removed = items.filter((i) => i.status === "removed");

  // One-tap suggestions: your active medications not already waiting on
  // this list, narrowed by whatever is typed.
  const query = label.trim().toLocaleLowerCase();
  const pendingMedicationIds = new Set(pending.map((i) => i.userMedicationId).filter(Boolean));
  const suggestions = medications
    .filter((m) => m.treatmentState === "active" && !pendingMedicationIds.has(m.id))
    .filter((m) => !query || (names.get(m.id) ?? "").toLocaleLowerCase().includes(query))
    .slice(0, MAX_SUGGESTIONS);

  return (
    <div className="flex flex-col gap-5 px-5 pt-1 pb-6">
      <h1 className="text-[28px] leading-tight font-bold tracking-tight wrap-break-word text-stone-900 dark:text-stone-50">{list?.name ?? "…"}</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor="new-item-label" className={FIELD_LABEL}>
          Προσθήκη είδους
        </label>
        <div className="flex gap-3">
          <input
            id="new-item-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Προσθέστε ένα είδος…"
            className={`${FIELD_INPUT} min-w-0 flex-1 pr-4`}
          />
          <button
            type="submit"
            disabled={!label.trim() || adding}
            aria-label="Προσθήκη στη λίστα"
            className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent-700 text-white transition-transform active:scale-95 disabled:opacity-50 dark:bg-accent-500 dark:text-stone-950"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.6">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {showPrice ? (
          <label className="flex items-center gap-3">
            <span className="text-[15px] font-medium text-stone-700 dark:text-stone-300">Εκτιμώμενη τιμή (€)</span>
            <input
              type="text"
              inputMode="decimal"
              value={priceEuros}
              onChange={(e) => setPriceEuros(e.target.value)}
              placeholder="π.χ. 4,50"
              className={`${FIELD_INPUT} min-h-12 max-w-32 pr-4`}
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={() => {
              playSound("button");
              setShowPrice(true);
            }}
            className="min-h-11 self-start text-[15px] font-semibold text-accent-700 dark:text-accent-400"
          >
            + Προσθήκη τιμής
          </button>
        )}

        {suggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[15px] text-stone-600 dark:text-stone-400">Από τα φάρμακά σας:</p>
            <ul className="flex flex-wrap gap-2" aria-label="Προσθήκη φαρμάκου στη λίστα">
              {suggestions.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={adding}
                    onClick={() => void add({ userMedicationId: m.id })}
                    className="min-h-11 rounded-xl bg-surface-muted px-3.5 text-[15px] font-semibold text-stone-800 active:scale-95 disabled:opacity-50 dark:text-stone-200"
                  >
                    + {medicationTitle(m.id)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>

      {status === "loading" && (
        <p role="status" className="text-sm text-stone-600 dark:text-stone-400">
          Φόρτωση…
        </p>
      )}

      {status === "ready" && items.length === 0 && <EmptyState icon={<EmptyListIcon />} title="Η λίστα είναι άδεια." />}

      {status === "ready" && pending.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="Προς αγορά">
          {pending.map((item) => {
            const name = itemDisplayName(item);
            return (
              <ItemRow
                key={item.id}
                item={item}
                name={name}
                detail={itemDetail(item)}
                toggleLabel={`Σήμανση "${name}" ως αγορασμένο`}
                onToggle={() => {
                  playSound("success");
                  void markPurchased(item.id);
                }}
                actions={
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        playSound("button");
                        void markRemoved(item.id);
                      }}
                    >
                      Δεν χρειάζεται πια
                    </Button>
                    <UndoableDeleteButton label={`Διαγραφή "${name}"`} onConfirm={() => void deleteItem(item.id)} />
                  </>
                }
              />
            );
          })}
        </ul>
      )}

      {status === "ready" && purchased.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="purchased-heading">
          <h2 id="purchased-heading" className="text-[17px] font-semibold text-stone-700 dark:text-stone-300">
            Αγορασμένα
          </h2>
          <ul className="flex flex-col gap-3">
            {purchased.map((item) => {
              const name = itemDisplayName(item);
              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  name={name}
                  detail={itemDetail(item)}
                  toggleLabel={`Αναίρεση αγοράς "${name}"`}
                  onToggle={() => {
                    playSound("button");
                    void markPending(item.id);
                  }}
                  footer={
                    item.userMedicationId ? (
                      <Link
                        href={`/medications/${item.userMedicationId}/packages/add`}
                        onClick={() => playSound("button")}
                        className="mt-0.5 inline-flex min-h-9 items-center text-[15px] font-semibold text-accent-700 dark:text-accent-400"
                      >
                        Προσθήκη στο απόθεμα
                      </Link>
                    ) : undefined
                  }
                  actions={<UndoableDeleteButton label={`Διαγραφή "${name}"`} onConfirm={() => void deleteItem(item.id)} />}
                />
              );
            })}
          </ul>
        </section>
      )}

      {status === "ready" && removed.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="removed-heading">
          <h2 id="removed-heading" className="text-[17px] font-semibold text-stone-500 dark:text-stone-400">
            Δεν χρειάζονται πια
          </h2>
          <ul className="flex flex-col gap-3">
            {removed.map((item) => {
              const name = itemDisplayName(item);
              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  name={name}
                  detail={itemDetail(item)}
                  actions={
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          playSound("button");
                          void markPending(item.id);
                        }}
                        aria-label={`Επαναφορά "${name}" στη λίστα`}
                      >
                        Επαναφορά
                      </Button>
                      <UndoableDeleteButton label={`Διαγραφή "${name}"`} onConfirm={() => void deleteItem(item.id)} />
                    </>
                  }
                />
              );
            })}
          </ul>
        </section>
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
