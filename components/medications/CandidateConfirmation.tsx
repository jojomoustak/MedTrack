"use client";

import type { CatalogProduct } from "@/lib/domain/catalog";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";

export interface CandidateConfirmationProps {
  product: CatalogProduct;
  onConfirm: () => void;
  onBack: () => void;
}

/**
 * Phase 3 §2.4 "Search — candidate confirmation": mandatory explicit
 * confirm before creating anything (never auto-created from a search
 * match alone, mirroring the scan flow's same rule in Phase 1 §7).
 */
export function CandidateConfirmation({ product, onConfirm, onBack }: CandidateConfirmationProps) {
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="min-h-12 self-start text-sm font-medium underline">
        ← Πίσω στα αποτελέσματα
      </button>

      <div className="rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="text-lg font-semibold">{product.name}</h2>
        {product.manufacturer && <p className="text-sm text-zinc-600 dark:text-zinc-400">{product.manufacturer}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {product.activeIngredient && (
            <>
              <dt className="text-zinc-500">Δραστική ουσία</dt>
              <dd>{product.activeIngredient}</dd>
            </>
          )}
          {product.strengthValue && (
            <>
              <dt className="text-zinc-500">Περιεκτικότητα</dt>
              <dd>
                {product.strengthValue} {product.strengthUnit}
              </dd>
            </>
          )}
          {product.form && (
            <>
              <dt className="text-zinc-500">Μορφή</dt>
              <dd>{product.form}</dd>
            </>
          )}
        </dl>
        {product.regulatorySource === SEED_PLACEHOLDER_SOURCE && (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
            Δοκιμαστικά δεδομένα καταλόγου — όχι επίσημη πηγή.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onConfirm}
        className="min-h-12 rounded-full bg-zinc-900 px-5 py-3 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        Επιβεβαίωση — είναι αυτό το φάρμακο
      </button>
    </div>
  );
}
