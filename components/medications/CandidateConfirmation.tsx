"use client";

import type { CatalogProduct } from "@/lib/domain/catalog";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";

export interface CandidateConfirmationProps {
  product: CatalogProduct;
  onConfirm: () => void;
  onBack: () => void;
  /** Set only for scan-sourced candidates (Phase 1 §7) — GS1 fields parsed alongside the GTIN that identified this product, shown so nothing the scanner read is silently dropped even though it isn't the catalog match itself. */
  parsedExpiry?: string | null;
  parsedBatch?: string | null;
  parsedSerial?: string | null;
}

/**
 * Phase 3 §2.4 "Search/Scan — candidate confirmation": mandatory explicit
 * confirm before creating anything (never auto-created from a search or
 * scan match alone — CLAUDE.md, Phase 1 §7). Shared by both entry paths
 * (`SearchStep`, `ScanStep`) rather than a second confirmation screen.
 */
export function CandidateConfirmation({ product, onConfirm, onBack, parsedExpiry, parsedBatch, parsedSerial }: CandidateConfirmationProps) {
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

      {(parsedExpiry || parsedBatch || parsedSerial) && (
        <div className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
          <p className="mb-2 text-sm font-medium">Από τη σάρωση</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {parsedExpiry && (
              <>
                <dt className="text-zinc-500">Ημερομηνία λήξης</dt>
                <dd>{parsedExpiry}</dd>
              </>
            )}
            {parsedBatch && (
              <>
                <dt className="text-zinc-500">Παρτίδα</dt>
                <dd>{parsedBatch}</dd>
              </>
            )}
            {parsedSerial && (
              <>
                <dt className="text-zinc-500">Σειριακός αριθμός</dt>
                <dd>{parsedSerial}</dd>
              </>
            )}
          </dl>
        </div>
      )}

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
