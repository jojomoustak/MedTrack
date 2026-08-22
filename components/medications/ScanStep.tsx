"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogProduct } from "@/lib/domain/catalog";
import type { ParsedBarcode } from "@/lib/domain/gs1";
import { parseBarcode } from "@/lib/domain/gs1";
import type { CatalogCacheRepository, UnresolvedScanRepository } from "@/lib/domain/repositories";
import { DexieUnresolvedScanRepository } from "@/lib/db-client/unresolved-scan-repository";
import { lookupGtin } from "@/lib/catalog/client/lookup-gtin";
import { useNetworkStatus } from "@/lib/sync/client/use-network-status";
import { getDefaultMobilePlatform } from "@/lib/platform/get-mobile-platform";
import { MobilePlatformUnavailableError, type MobilePlatform } from "@/lib/platform/mobile-platform";
import { newId } from "@/lib/domain/ids";
import { logger } from "@/lib/logging/logger";
import { CandidateConfirmation } from "@/components/medications/CandidateConfirmation";

export interface ScanStepProps {
  profileId: string;
  /** Fires once the user gives mandatory explicit confirmation on a scan-sourced catalog match (never auto-created from the scan alone — CLAUDE.md, Phase 1 §7). */
  onConfirmCandidate: (product: CatalogProduct, parsed: ParsedBarcode) => void;
  /** Fires on "couldn't identify automatically" → "Continue manually," carrying whatever GS1 fields were parsed (or `null` if the raw value couldn't be parsed as a GTIN at all). */
  onFallbackToManual: (parsed: ParsedBarcode | null) => void;
  /** Fires on a native cancel, or the user backing out of an error/unavailable state — returns quietly to the entry chooser, no error shown (bridge contract's `cancelled` status). */
  onCancel: () => void;
  /** Test/DI seam — defaults to the real Median-backed implementation. */
  platform?: MobilePlatform;
  cacheRepository?: CatalogCacheRepository;
  unresolvedScanRepository?: UnresolvedScanRepository;
}

type ViewState =
  | { phase: "scanning" }
  | { phase: "looking-up" }
  | { phase: "candidate"; product: CatalogProduct; parsed: ParsedBarcode }
  | { phase: "not-found"; parsed: ParsedBarcode | null; offline: boolean }
  | { phase: "unavailable" }
  | { phase: "error"; message: string };

/**
 * Phase 3 Journey 3 "Scan to identify": invokes `MobilePlatform.scanBarcode()`
 * on mount, GS1-parses a successful result, looks up the GTIN
 * (local-cache-first, Phase 1 §7), and routes to candidate confirmation or
 * the "couldn't identify automatically" fallback. Offline + uncached: the
 * scan is saved (`UnresolvedScanRepository`) and the user can continue
 * manually immediately rather than wait (Phase 3 §4).
 */
export function ScanStep({
  profileId,
  onConfirmCandidate,
  onFallbackToManual,
  onCancel,
  platform,
  cacheRepository,
  unresolvedScanRepository,
}: ScanStepProps) {
  const network = useNetworkStatus();
  const [view, setView] = useState<ViewState>({ phase: "scanning" });
  const startedRef = useRef(false);
  const mountedRef = useRef(true);
  const networkRef = useRef(network);
  networkRef.current = network;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs exactly once per mount by design (startedRef guard); re-running on every prop identity change would re-trigger the native camera.
  }, []);

  async function runScan() {
    const activePlatform = platform ?? getDefaultMobilePlatform();

    if (!activePlatform.isAvailable()) {
      if (mountedRef.current) setView({ phase: "unavailable" });
      return;
    }

    if (mountedRef.current) setView({ phase: "scanning" });

    let result;
    try {
      result = await activePlatform.scanBarcode();
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof MobilePlatformUnavailableError) {
        setView({ phase: "unavailable" });
      } else {
        logger.warn("scan_step.platform_error", { message: (err as Error).message });
        setView({ phase: "error", message: "Κάτι πήγε στραβά με τη σάρωση. Δοκιμάστε ξανά." });
      }
      return;
    }

    if (!mountedRef.current) return;

    if (result.status === "cancelled") {
      onCancel();
      return;
    }

    if (result.status === "error") {
      logger.warn("scan_step.native_error", { errorCode: result.errorCode });
      setView({ phase: "error", message: "Δεν ήταν δυνατή η ανάγνωση του barcode. Δοκιμάστε ξανά ή συνεχίστε χειροκίνητα." });
      return;
    }

    const parsed = parseBarcode(result.rawValue, result.format);

    if (!parsed.gtin) {
      setView({ phase: "not-found", parsed, offline: false });
      return;
    }

    setView({ phase: "looking-up" });
    const outcome = await lookupGtin(parsed.gtin, networkRef.current, { cache: cacheRepository });
    if (!mountedRef.current) return;

    if (outcome.status === "found") {
      setView({ phase: "candidate", product: outcome.product, parsed });
      return;
    }

    if (outcome.status === "unresolved-offline") {
      try {
        const repo = unresolvedScanRepository ?? new DexieUnresolvedScanRepository();
        await repo.save({
          id: newId(),
          profileId,
          gtin: parsed.gtin,
          rawValue: parsed.raw,
          format: parsed.format,
          parsedExpiry: parsed.expiry,
          parsedBatch: parsed.batch,
          parsedSerial: parsed.serial,
        });
      } catch (err) {
        logger.warn("scan_step.save_unresolved_failed", { message: (err as Error).message });
      }
      if (mountedRef.current) setView({ phase: "not-found", parsed, offline: true });
      return;
    }

    setView({ phase: "not-found", parsed, offline: false });
  }

  if (view.phase === "scanning" || view.phase === "looking-up") {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p role="status" aria-live="polite" className="text-sm text-zinc-600 dark:text-zinc-400">
          {view.phase === "scanning" ? "Άνοιγμα κάμερας…" : "Αναζήτηση φαρμάκου…"}
        </p>
        <button type="button" onClick={onCancel} className="min-h-12 text-sm font-medium underline">
          Ακύρωση
        </button>
      </div>
    );
  }

  if (view.phase === "unavailable") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-center dark:border-zinc-700">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Η σάρωση barcode διατίθεται μόνο μέσα από την εφαρμογή MedTracking για κινητά.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onFallbackToManual(null)}
          className="min-h-12 rounded-full bg-zinc-900 px-5 py-2 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Συνέχεια με χειροκίνητη καταχώριση
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 self-start text-sm font-medium underline">
          ← Πίσω
        </button>
      </div>
    );
  }

  if (view.phase === "error") {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {view.message}
        </p>
        <button
          type="button"
          onClick={() => {
            startedRef.current = false;
            void runScan();
          }}
          className="min-h-12 rounded-full bg-zinc-900 px-5 py-2 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Δοκιμάστε ξανά
        </button>
        <button
          type="button"
          onClick={() => onFallbackToManual(null)}
          className="min-h-12 text-sm font-medium underline"
        >
          Συνέχεια με χειροκίνητη καταχώριση
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 self-start text-sm font-medium underline">
          ← Πίσω
        </button>
      </div>
    );
  }

  if (view.phase === "candidate") {
    return (
      <CandidateConfirmation
        product={view.product}
        parsedExpiry={view.parsed.expiry}
        parsedBatch={view.parsed.batch}
        parsedSerial={view.parsed.serial}
        onConfirm={() => onConfirmCandidate(view.product, view.parsed)}
        onBack={onCancel}
      />
    );
  }

  // view.phase === "not-found"
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-center dark:border-zinc-700">
        <p className="mb-1 text-sm text-zinc-700 dark:text-zinc-300">
          {view.offline
            ? "Είστε εκτός σύνδεσης — δεν μπορέσαμε να αναγνωρίσουμε αυτόματα αυτό το πακέτο. Το αποθηκεύσαμε και θα προσπαθήσουμε ξανά μόλις συνδεθείτε."
            : "Δεν μπορέσαμε να αναγνωρίσουμε αυτόματα αυτό το πακέτο. Αυτό είναι φυσιολογικό — ο κατάλογος είναι ακόμα περιορισμένος."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onFallbackToManual(view.parsed)}
        className="min-h-12 rounded-full bg-zinc-900 px-5 py-2 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
      >
        Συνέχεια με χειροκίνητη καταχώριση
      </button>
      <button type="button" onClick={onCancel} className="min-h-12 self-start text-sm font-medium underline">
        ← Πίσω
      </button>
    </div>
  );
}
