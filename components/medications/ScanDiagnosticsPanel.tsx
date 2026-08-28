"use client";

import type { BarcodeFormat } from "@/lib/domain/gs1";

export interface ScanDiagnostics {
  format: BarcodeFormat;
  gtin: string | null;
  batch: string | null;
  expiry: string | null;
  /**
   * Presence only, NEVER the actual serial value (GTIN-resolution task
   * spec §4/§8: "never use serial number as medication identity," "do not
   * send serial values to... unnecessary server logs," "prefer not to
   * persist serial"). The serial is package-instance data, not shown here
   * under any circumstance — not even in development builds — since a
   * diagnostics screen is exactly the kind of surface that gets screenshot
   * and pasted somewhere it shouldn't be.
   */
  serialPresent: boolean;
  resolutionState: "found" | "not-found" | "conflict" | "unresolved-offline" | "unrecognized";
  matchedIdentifierType: "EOF_CODE" | "GTIN" | null;
  matchedProductName: string | null;
}

/**
 * Development-only scan diagnostics (GTIN-resolution task spec §8) — the
 * screen this task explicitly asks for to diagnose real medicine boxes
 * (e.g. "does this physical FLAGYL package's DataMatrix carry the same
 * GTIN the national EAN-13 implies, or a different one"). Gated on
 * `NODE_ENV !== "production"` internally so it's a true no-op in any
 * production build — never conditionally imported/tree-shaken by a build
 * flag that could be misconfigured, just a plain runtime check that's
 * `false` in every real deployment.
 *
 * Never persisted (`lib/db-client/*`) — this is render-only, sourced
 * directly from the current scan's in-memory `ParsedBarcode`/resolution
 * outcome, gone the moment the component unmounts. Never logged either
 * (CLAUDE.md rule 8: no raw health data in logs) — this is UI, not a
 * `logger.*` call.
 */
export function ScanDiagnosticsPanel({ diagnostics }: { diagnostics: ScanDiagnostics }) {
  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3 text-xs dark:border-amber-700 dark:bg-amber-950">
      <p className="mb-2 font-semibold text-amber-800 dark:text-amber-300">Διαγνωστικά σάρωσης (μόνο development)</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-amber-900 dark:text-amber-200">
        <dt>Format:</dt>
        <dd>{diagnostics.format}</dd>
        <dt>GTIN:</dt>
        <dd>{diagnostics.gtin ?? "—"}</dd>
        <dt>Batch:</dt>
        <dd>{diagnostics.batch ?? "—"}</dd>
        <dt>Expiry:</dt>
        <dd>{diagnostics.expiry ?? "—"}</dd>
        <dt>Serial:</dt>
        <dd>{diagnostics.serialPresent ? "present" : "absent"}</dd>
        <dt>Resolution state:</dt>
        <dd>{diagnostics.resolutionState}</dd>
        <dt>Matched identifier type:</dt>
        <dd>{diagnostics.matchedIdentifierType ?? "—"}</dd>
        <dt>Matched product:</dt>
        <dd>{diagnostics.matchedProductName ?? "—"}</dd>
      </dl>
    </div>
  );
}
