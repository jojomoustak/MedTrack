"use client";

import { useState } from "react";
import { useCatalogSearch } from "@/lib/catalog/client/use-catalog-search";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { CandidateConfirmation } from "@/components/medications/CandidateConfirmation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { playSound } from "@/lib/sound/client/play-sound";
import { formatQuantity } from "@/lib/domain/quantity";

export interface SearchStepProps {
  onConfirmCandidate: (product: CatalogProduct) => void;
  onFallbackToManual: () => void;
}

function formatSubtitle(product: CatalogProduct): string {
  const parts = [product.activeIngredient, product.strengthValue ? `${formatQuantity(product.strengthValue)}${product.strengthUnit ?? ""}` : null].filter(Boolean);
  return parts.join(" · ");
}

/** Phase 3 §2.4 "Search catalog" + "Search — candidate confirmation". Accent-insensitive Greek search (server-side `unaccent`/`pg_trgm`, `lib/catalog/server/postgres-provider.ts`); offline falls back to the local cache (`lib/catalog/client/use-catalog-search.ts`). */
export function SearchStep({ onConfirmCandidate, onFallbackToManual }: SearchStepProps) {
  const [query, setQuery] = useState("");
  const [candidate, setCandidate] = useState<CatalogProduct | null>(null);
  const { status, results } = useCatalogSearch(query);

  if (candidate) {
    return (
      <CandidateConfirmation
        product={candidate}
        onConfirm={() => onConfirmCandidate(candidate)}
        onBack={() => setCandidate(null)}
      />
    );
  }

  const trimmed = query.trim();
  const showNoResults = status === "success" && trimmed.length >= 2 && results.length === 0;
  const showOfflineEmpty = status === "offline-cache" && results.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Αναζήτηση φαρμάκου</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="π.χ. παρακεταμόλη"
          aria-label="Αναζήτηση φαρμάκου"
          className="min-h-12 rounded-lg border border-stone-300 px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>

      {status === "loading" && (
        <p role="status" aria-live="polite" className="text-sm text-stone-600 dark:text-stone-400">
          Αναζήτηση…
        </p>
      )}

      {status === "offline-cache" && results.length > 0 && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-400">
          Είστε εκτός σύνδεσης — εμφανίζονται μόνο φάρμακα που έχετε ξαναδεί.
        </p>
      )}

      {(status === "success" || status === "offline-cache") && results.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Αποτελέσματα αναζήτησης">
          {results.map((product) => (
            <li key={product.id}>
              <Card
                as="button"
                type="button"
                onClick={() => { playSound("button"); setCandidate(product); }}
                className="flex min-h-12 w-full flex-col items-start px-4 py-3 text-left transition-transform duration-150 active:scale-[0.98] hover:bg-stone-50 dark:hover:bg-stone-900"
              >
                <span className="font-medium">{product.name}</span>
                <span className="text-sm text-stone-600 dark:text-stone-400">{formatSubtitle(product)}</span>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {(showNoResults || showOfflineEmpty) && (
        <div className="rounded-xl border border-dashed border-stone-300 p-4 text-center dark:border-stone-700">
          <p className="mb-3 text-sm text-stone-700 dark:text-stone-300">
            Δεν βρέθηκε το φάρμακο. Αυτό είναι φυσιολογικό — ο κατάλογος είναι ακόμα περιορισμένος.
          </p>
          {/* Equally weighted with search results, never a dead end (Phase 3 §2.4/§8). */}
          <Button onClick={() => { playSound("button"); onFallbackToManual(); }}>
            Συνέχεια με χειροκίνητη καταχώριση
          </Button>
        </div>
      )}

      {status === "idle" && (
        <Button variant="tertiary" onClick={() => { playSound("button"); onFallbackToManual(); }} className="self-start px-0 underline">
          Προτιμώ χειροκίνητη καταχώριση
        </Button>
      )}
    </div>
  );
}
