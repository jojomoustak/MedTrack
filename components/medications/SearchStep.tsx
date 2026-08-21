"use client";

import { useState } from "react";
import { useCatalogSearch } from "@/lib/catalog/client/use-catalog-search";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { CandidateConfirmation } from "@/components/medications/CandidateConfirmation";

export interface SearchStepProps {
  onConfirmCandidate: (product: CatalogProduct) => void;
  onFallbackToManual: () => void;
}

function formatSubtitle(product: CatalogProduct): string {
  const parts = [product.activeIngredient, product.strengthValue ? `${product.strengthValue}${product.strengthUnit ?? ""}` : null].filter(Boolean);
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
          className="min-h-12 rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

      {status === "loading" && (
        <p role="status" aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">
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
              <button
                type="button"
                onClick={() => setCandidate(product)}
                className="flex min-h-12 w-full flex-col items-start rounded-xl border border-zinc-300 px-4 py-3 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                <span className="font-medium">{product.name}</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{formatSubtitle(product)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(showNoResults || showOfflineEmpty) && (
        <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-center dark:border-zinc-700">
          <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
            Δεν βρέθηκε το φάρμακο. Αυτό είναι φυσιολογικό — ο κατάλογος είναι ακόμα περιορισμένος.
          </p>
          {/* Equally weighted with search results, never a dead end (Phase 3 §2.4/§8). */}
          <button
            type="button"
            onClick={onFallbackToManual}
            className="min-h-12 rounded-full bg-zinc-900 px-5 py-2 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
          >
            Συνέχεια με χειροκίνητη καταχώριση
          </button>
        </div>
      )}

      {status === "idle" && (
        <button
          type="button"
          onClick={onFallbackToManual}
          className="min-h-12 self-start text-sm font-medium text-zinc-700 underline dark:text-zinc-300"
        >
          Προτιμώ χειροκίνητη καταχώριση
        </button>
      )}
    </div>
  );
}
