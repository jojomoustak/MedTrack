"use client";

import { useState } from "react";
import type { CatalogProduct } from "@/lib/domain/catalog";
import type { ParsedBarcode } from "@/lib/domain/gs1";
import { extractPackageOcrResult } from "@/lib/domain/ocr";
import { rankPackageCandidates, type OcrConfidenceState, type PackageCandidateScore } from "@/lib/domain/package-candidate-matching";
import { offlineIndexEntryToCatalogProduct, type OfflineIndexEntry } from "@/lib/domain/offline-index";
import type { CatalogCacheRepository, LearnedMappingRepository, OfflineIndexRepository } from "@/lib/domain/repositories";
import { DexieOfflineIndexRepository } from "@/lib/db-client/offline-index-repository";
import { DexieLearnedMappingRepository } from "@/lib/db-client/learned-mapping-repository";
import { DexieCatalogCacheRepository } from "@/lib/db-client/catalog-cache-repository";
import { confirmCatalogIdentifier } from "@/lib/catalog/client/api";
import { getDefaultMobilePlatform } from "@/lib/platform/get-mobile-platform";
import { MobilePlatformUnavailableError, type MobilePlatform } from "@/lib/platform/mobile-platform";
import { CandidateConfirmation } from "@/components/medications/CandidateConfirmation";
import { logger } from "@/lib/logging/logger";

export interface PackageOcrCandidateFlowProps {
  /** The GTIN that came back `VALID_IDENTIFIER_UNRESOLVED` — what a confirmed candidate gets mapped to (spec §12). */
  gtin: string;
  parsed: ParsedBarcode;
  onConfirmCandidate: (product: CatalogProduct, parsed: ParsedBarcode) => void;
  onFallbackToManual: () => void;
  platform?: MobilePlatform;
  offlineIndex?: OfflineIndexRepository;
  learnedMappings?: LearnedMappingRepository;
  cacheRepository?: CatalogCacheRepository;
  fetchImpl?: typeof fetch;
}

type FlowState =
  | { phase: "idle" }
  | { phase: "capturing" }
  | { phase: "processing" }
  /** OCR_AMBIGUOUS only (spec §10) — several package candidates tied closely enough that none can be shown alone. */
  | { phase: "picking"; scores: readonly PackageCandidateScore[] }
  /** A single candidate — either OCR_HIGH_CONFIDENCE/OCR_PARTIAL directly, or the user's own pick from `picking`. Reuses `CandidateConfirmation`, the SAME mandatory-confirmation UI every other resolution path uses (spec §10: "High confidence still requires user confirmation") — this is not a separate, weaker confirmation step. */
  | { phase: "confirming"; entry: OfflineIndexEntry; confidence: OcrConfidenceState }
  | { phase: "not-found" }
  | { phase: "error"; message: string };

function formatCandidateLabel(entry: OfflineIndexEntry): string {
  const parts = [entry.name];
  if (entry.strengthValue) parts.push(`${entry.strengthValue}${entry.strengthUnit ? ` ${entry.strengthUnit}` : ""}`);
  if (entry.form) parts.push(entry.form);
  if (entry.packSizeValue) parts.push(`× ${entry.packSizeValue}${entry.packSizeUnit ? ` ${entry.packSizeUnit}` : ""}`);
  return parts.join(" — ");
}

/**
 * Feature A + B of the OCR-fallback task: offers on-device package-label
 * OCR only after an exact identifier lookup already came back unresolved
 * (spec §1 — `ScanStep` only renders this after `VALID_IDENTIFIER_UNRESOLVED`),
 * ranks the result against the SAME synced offline catalog every other
 * resolution path uses (spec §7), and — only after the user's own explicit
 * confirmation on the final `CandidateConfirmation` screen — records a
 * device-local `USER_CONFIRMED` mapping (spec §12) so the same GTIN
 * resolves instantly offline next time (spec §15), with a best-effort
 * background attempt to persist the same confirmation server-side (spec
 * §16) that never blocks or fails the local write.
 *
 * Never exposes internal state names in UI copy (spec §11) — every string
 * below is plain language, not `OCR_AMBIGUOUS`/`VALID_IDENTIFIER_UNRESOLVED`.
 */
export function PackageOcrCandidateFlow({
  gtin,
  parsed,
  onConfirmCandidate,
  onFallbackToManual,
  platform,
  offlineIndex,
  learnedMappings,
  cacheRepository,
  fetchImpl,
}: PackageOcrCandidateFlowProps) {
  const [state, setState] = useState<FlowState>({ phase: "idle" });

  async function startOcr() {
    const activePlatform = platform ?? getDefaultMobilePlatform();
    if (!activePlatform.isAvailable()) {
      setState({ phase: "error", message: "Η αναγνώριση από ετικέτα διατίθεται μόνο μέσα από την εφαρμογή MedTracking για κινητά." });
      return;
    }

    setState({ phase: "capturing" });
    let result;
    try {
      result = await activePlatform.recognizePackageText();
    } catch (err) {
      if (err instanceof MobilePlatformUnavailableError) {
        setState({ phase: "error", message: err.message });
      } else {
        logger.warn("package_ocr_flow.platform_error", { message: (err as Error).message });
        setState({ phase: "error", message: "Κάτι πήγε στραβά με τη λήψη φωτογραφίας. Δοκιμάστε ξανά." });
      }
      return;
    }

    if (result.status === "cancelled") {
      setState({ phase: "idle" });
      return;
    }
    if (result.status === "error") {
      logger.warn("package_ocr_flow.native_error", { errorCode: result.errorCode });
      setState({ phase: "error", message: "Δεν ήταν δυνατή η ανάγνωση της ετικέτας. Δοκιμάστε ξανά ή αναζητήστε χειροκίνητα." });
      return;
    }

    setState({ phase: "processing" });
    const ocrResult = extractPackageOcrResult(result.rawText);
    const repository = offlineIndex ?? new DexieOfflineIndexRepository();
    const entries = await repository.getAll();
    const match = rankPackageCandidates(ocrResult, entries);

    if (match.confidence === "OCR_NOT_FOUND") {
      setState({ phase: "not-found" });
      return;
    }
    if (match.confidence === "OCR_AMBIGUOUS") {
      setState({ phase: "picking", scores: match.candidates });
      return;
    }
    setState({ phase: "confirming", entry: match.candidates[0].entry, confidence: match.confidence });
  }

  async function handleConfirm(entry: OfflineIndexEntry) {
    const mappingRepository = learnedMappings ?? new DexieLearnedMappingRepository();
    const cache = cacheRepository ?? new DexieCatalogCacheRepository();
    const confirmedAt = new Date().toISOString();
    const product = offlineIndexEntryToCatalogProduct(entry);

    try {
      // Same requirement as `lookup-gtin.ts`/`lookup-eof-code.ts`'s
      // offline-index-hit branches: the medications list resolves a
      // `UserMedication`'s display name solely via `catalogProductCache`,
      // by id — skipping this means the medicine this screen just
      // confirmed would show as a generic placeholder forever after.
      await cache.cacheAll([product]);
    } catch (err) {
      logger.warn("package_ocr_flow.cache_product_failed", { message: (err as Error).message });
    }

    try {
      const { overwroteDifferentProduct } = await mappingRepository.save({
        gtin,
        catalogProductId: entry.id,
        evidenceType: "USER_CONFIRMED",
        confirmedAt,
        syncedAt: null,
      });
      if (overwroteDifferentProduct) {
        logger.warn("package_ocr_flow.learned_mapping_overwritten", { gtin });
      }
    } catch (err) {
      // Never blocks confirmation — the local mapping is a durability
      // nicety for the NEXT scan, not a precondition for using this one
      // (spec §15 is about repeat scans, not this one).
      logger.warn("package_ocr_flow.save_learned_mapping_failed", { message: (err as Error).message });
    }

    // Best-effort, fire-and-forget (module doc / spec §16): never awaited
    // by the caller, never blocks `onConfirmCandidate` below.
    confirmCatalogIdentifier("GTIN", gtin, entry.id, fetchImpl)
      .then(() => mappingRepository.markSynced(gtin, new Date().toISOString()))
      .catch((err: Error) => logger.warn("package_ocr_flow.server_confirm_failed", { message: err.message }));

    onConfirmCandidate(product, parsed);
  }

  if (state.phase === "idle") {
    return (
      <button
        type="button"
        onClick={() => void startOcr()}
        className="min-h-12 rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium dark:border-zinc-700"
      >
        Δοκιμή αναγνώρισης από την ετικέτα του πακέτου
      </button>
    );
  }

  if (state.phase === "capturing" || state.phase === "processing") {
    return (
      <p role="status" aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">
        {state.phase === "capturing" ? "Άνοιγμα κάμερας…" : "Ανάλυση ετικέτας…"}
      </p>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="flex flex-col gap-2">
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
        <button type="button" onClick={() => setState({ phase: "idle" })} className="min-h-10 self-start text-sm font-medium underline">
          Δοκιμάστε ξανά
        </button>
      </div>
    );
  }

  if (state.phase === "not-found") {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
          Δεν βρέθηκε αντιστοιχία από την ετικέτα. Δοκιμάστε ξανά με καλύτερο φωτισμό ή αναζητήστε χειροκίνητα.
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={() => setState({ phase: "idle" })} className="min-h-10 text-sm font-medium underline">
            Δοκιμάστε ξανά
          </button>
          <button type="button" onClick={onFallbackToManual} className="min-h-10 text-sm font-medium underline">
            Χειροκίνητη αναζήτηση
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "picking") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
        <p className="text-sm font-medium">Βρήκαμε πολλές πιθανές συσκευασίες. Επιλέξτε αυτή που αναγράφεται στο κουτί σας:</p>
        <ul className="flex flex-col gap-2">
          {state.scores.map((score) => (
            <li key={score.entry.id}>
              <button
                type="button"
                onClick={() => setState({ phase: "confirming", entry: score.entry, confidence: "OCR_AMBIGUOUS" })}
                className="min-h-10 w-full rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm dark:border-zinc-800"
              >
                {formatCandidateLabel(score.entry)}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onFallbackToManual} className="min-h-10 self-start text-sm font-medium underline">
          Καμία δεν ταιριάζει — χειροκίνητη αναζήτηση
        </button>
      </div>
    );
  }

  // state.phase === "confirming"
  const product = offlineIndexEntryToCatalogProduct(state.entry);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Βρέθηκε από την ετικέτα του πακέτου — επιβεβαιώστε ότι είναι σωστό:</p>
      <CandidateConfirmation
        product={product}
        parsedExpiry={parsed.expiry}
        parsedBatch={parsed.batch}
        parsedSerial={parsed.serial}
        onConfirm={() => void handleConfirm(state.entry)}
        onBack={() => setState({ phase: "idle" })}
      />
    </div>
  );
}
