"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogProduct } from "@/lib/domain/catalog";
import type { ParsedBarcode } from "@/lib/domain/gs1";
import { parseBarcode } from "@/lib/domain/gs1";
import { classifyBarcode } from "@/lib/domain/medication-identifier";
import type { CatalogCacheRepository, UnresolvedScanRepository } from "@/lib/domain/repositories";
import { DexieUnresolvedScanRepository } from "@/lib/db-client/unresolved-scan-repository";
import { lookupGtin } from "@/lib/catalog/client/lookup-gtin";
import { lookupEofCode } from "@/lib/catalog/client/lookup-eof-code";
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
  /**
   * `recognizedButUnavailable` distinguishes two different "not found"
   * situations (spec: architecture doc §2.5's Path A "unknown offline
   * barcode" case): a well-formed Greek national EAN-13 that decoded
   * cleanly but has no matching catalog entry (the barcode itself is
   * understood — MedTracking just doesn't have data for this specific
   * product yet) vs. a barcode that couldn't be identified as any known
   * scheme at all. Never guessed either way — this only changes which
   * message is shown, not any resolution behavior.
   */
  | { phase: "not-found"; parsed: ParsedBarcode | null; offline: boolean; recognizedButUnavailable: boolean }
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
      setView({ phase: "not-found", parsed, offline: false, recognizedButUnavailable: false });
      return;
    }

    setView({ phase: "looking-up" });
    // Path A (medication-resolution-architecture.md §2.5): a well-formed
    // Greek national `280`-prefix EAN-13 resolves by its decoded EOF code,
    // not by GTIN — that barcode isn't a globally-resolvable GTIN at all
    // (architecture doc §2.1), so `classifyBarcode` routes it to a
    // different lookup entirely rather than reusing `parsed.gtin`. Anything
    // else (including an unrecognized-scheme barcode, which still has a
    // padded `parsed.gtin` from `parseBarcode`'s plain-EAN normalization)
    // falls through to the existing, unchanged Path B GTIN lookup.
    const identifier = classifyBarcode(result.rawValue, result.format);
    const isGreekNational = identifier?.kind === "GREEK_NATIONAL_EAN13";
    const outcome = isGreekNational
      ? await lookupEofCode(identifier.eofCode, networkRef.current, { cache: cacheRepository })
      : await lookupGtin(parsed.gtin, networkRef.current, { cache: cacheRepository });
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
      if (mountedRef.current) setView({ phase: "not-found", parsed, offline: true, recognizedButUnavailable: isGreekNational });
      return;
    }

    setView({ phase: "not-found", parsed, offline: false, recognizedButUnavailable: isGreekNational });
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
  const searchTerm = view.parsed?.gtin ?? view.parsed?.raw ?? null;
  // `recognizedButUnavailable`: the barcode itself decoded cleanly as a
  // Greek national medicine identifier (architecture doc §2.5) — MedTracking
  // just doesn't have a catalog entry for this specific product yet. A
  // materially more honest message than the generic "couldn't identify"
  // one, and never a guess either way (spec §26).
  const notFoundMessage = view.offline
    ? view.recognizedButUnavailable
      ? "Αναγνωρίσαμε τον κωδικό του φαρμάκου, αλλά δεν έχουμε ακόμα στοιχεία για αυτό το προϊόν εκτός σύνδεσης. Το αποθηκεύσαμε και θα προσπαθήσουμε ξανά μόλις συνδεθείτε."
      : "Είστε εκτός σύνδεσης — δεν μπορέσαμε να αναγνωρίσουμε αυτόματα αυτό το πακέτο. Το αποθηκεύσαμε και θα προσπαθήσουμε ξανά μόλις συνδεθείτε."
    : view.recognizedButUnavailable
      ? "Αναγνωρίσαμε τον κωδικό του φαρμάκου, αλλά δεν έχουμε ακόμα στοιχεία για αυτό το προϊόν στον κατάλογό μας."
      : "Δεν μπορέσαμε να αναγνωρίσουμε αυτόματα αυτό το πακέτο. Αυτό είναι φυσιολογικό — ο κατάλογος είναι ακόμα περιορισμένος.";
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-dashed border-zinc-300 p-4 text-center dark:border-zinc-700">
        <p className="mb-1 text-sm text-zinc-700 dark:text-zinc-300">{notFoundMessage}</p>
      </div>
      {searchTerm && !view.offline && <OfficialSourceSearchLinks searchTerm={searchTerm} />}
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

/**
 * Optional convenience for the "not found" fallback: lets the user check
 * this specific number against real official regulatory sources
 * themselves, rather than MedTracking guessing at or scraping a match.
 *
 * Deliberately NOT a pre-filled deep link: neither EOF's "Αναζήτηση
 * φαρμάκων" tool (`services.eof.gr/human-search/home.xhtml`) nor EMA's
 * medicine finder documents a URL query-parameter contract for
 * pre-filling a search (confirmed by checking both sites directly,
 * 2026-08-23 — not assumed), so promising a pre-filled result would be a
 * claim this code can't actually keep. Instead: copy the number, open the
 * official page, the user pastes it in and reads the result themselves —
 * this only ever opens real official government/EU regulatory sites, and
 * MedTracking never parses or trusts whatever the user finds there; if
 * they want to use it, they still go through "Continue manually" and
 * confirm it themselves (CLAUDE.md: never auto-create from an external
 * lookup, and that discipline applies just as much to a source the user
 * found on their own as to an automated one).
 */
function OfficialSourceSearchLinks({ searchTerm }: { searchTerm: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(searchTerm);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (permissions, older WebView); the
      // number is still shown on-screen below for the user to select/type
      // manually, so this failure mode is a minor inconvenience, not a dead end.
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Αναζήτηση σε επίσημες πηγές
      </p>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-500">
        Αντιγράψτε τον κωδικό και αναζητήστε τον στον ιστότοπο του Εθνικού Οργανισμού Φαρμάκων (ΕΟΦ) ή
        του Ευρωπαϊκού Οργανισμού Φαρμάκων (EMA). Τα αποτελέσματα εμφανίζονται στον ιστότοπό τους — το
        MedTracking δεν τα διαβάζει ούτε τα συμπληρώνει αυτόματα.
      </p>
      <div className="mb-3 flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
        <code className="flex-1 truncate text-sm">{searchTerm}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="min-h-8 shrink-0 rounded-full border border-zinc-300 px-3 text-xs font-medium dark:border-zinc-700"
        >
          {copied ? "Αντιγράφηκε ✓" : "Αντιγραφή"}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <a
          href="https://services.eof.gr/human-search/home.xhtml"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-10 rounded-full border border-zinc-300 px-4 py-2 text-center text-sm font-medium underline dark:border-zinc-700"
        >
          Αναζήτηση στον ΕΟΦ (eof.gr)
        </a>
        <a
          href="https://www.ema.europa.eu/en/medicines"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-10 rounded-full border border-zinc-300 px-4 py-2 text-center text-sm font-medium underline dark:border-zinc-700"
        >
          Αναζήτηση στον EMA (ema.europa.eu)
        </a>
      </div>
    </div>
  );
}
