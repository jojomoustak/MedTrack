"use client";

import type { CatalogProduct } from "@/lib/domain/catalog";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";
import { playSound } from "@/lib/sound/client/play-sound";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FORM_LABELS } from "@/components/medications/DetailsStep";
import { formatQuantity } from "@/lib/domain/quantity";
import type { MedicationForm } from "@/lib/domain/user-medication";

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
      <Button
        variant="tertiary"
        onClick={() => {
          playSound("button");
          onBack();
        }}
        className="self-start px-0 underline"
      >
        ← Πίσω στα αποτελέσματα
      </Button>

      <Card>
        <h2 className="text-[22px] font-bold tracking-tight text-stone-900 dark:text-stone-50">{product.name}</h2>
        {product.manufacturer && <p className="text-[15px] text-stone-600 dark:text-stone-400">{product.manufacturer}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {product.activeIngredient && (
            <>
              <dt className="text-stone-500">Δραστική ουσία</dt>
              <dd>{product.activeIngredient}</dd>
            </>
          )}
          {product.strengthValue && (
            <>
              <dt className="text-stone-500">Περιεκτικότητα</dt>
              <dd>
                {formatQuantity(product.strengthValue)} {product.strengthUnit}
              </dd>
            </>
          )}
          {product.form && (
            <>
              <dt className="text-stone-500">Μορφή</dt>
              <dd>{FORM_LABELS[product.form as MedicationForm] ?? product.form}</dd>
            </>
          )}
        </dl>
        {product.regulatorySource === SEED_PLACEHOLDER_SOURCE && (
          <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
            Δοκιμαστικά δεδομένα καταλόγου — όχι επίσημη πηγή.
          </p>
        )}
      </Card>

      {(parsedExpiry || parsedBatch || parsedSerial) && (
        <div className="rounded-xl border border-dashed border-stone-300 p-4 dark:border-stone-700">
          <p className="mb-2 text-sm font-medium">Από τη σάρωση</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {parsedExpiry && (
              <>
                <dt className="text-stone-500">Ημερομηνία λήξης</dt>
                <dd>{parsedExpiry}</dd>
              </>
            )}
            {parsedBatch && (
              <>
                <dt className="text-stone-500">Παρτίδα</dt>
                <dd>{parsedBatch}</dd>
              </>
            )}
            {parsedSerial && (
              <>
                <dt className="text-stone-500">Σειριακός αριθμός</dt>
                <dd>{parsedSerial}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      <Button
        onClick={() => {
          playSound("button");
          onConfirm();
        }}
      >
        Επιβεβαίωση — είναι αυτό το φάρμακο
      </Button>
    </div>
  );
}
