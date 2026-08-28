/**
 * The single seam between the shared web/TS layer and Median's native
 * shell (Phase 1 §3, ADR-005): `React UI → MobilePlatform (interface) →
 * MedianMobilePlatform (impl) → Median JS bridge → Kotlin`. No component
 * or hook may talk to the Median bridge directly — every native
 * capability call routes through this interface, so (a) a future
 * container swap only touches the implementation (ADR-005's stated
 * purpose for this seam), and (b) tests can inject a fake instead of
 * needing a real WebView.
 */
import type { BarcodeFormat } from "@/lib/domain/gs1";

/**
 * The three response shapes the native scan command can deliver, exactly
 * as specified by the fixed web/native bridge contract for `scan`. Do not
 * add a fourth status here — anything outside these three (e.g. "there is
 * no native shell to even ask") is represented as a rejected Promise
 * (`MobilePlatformUnavailableError`), not a new `ScanResult` status, so
 * this type stays a precise mirror of what native can actually send.
 */
export interface ScanResultOk {
  status: "ok";
  rawValue: string;
  format: BarcodeFormat;
}
export interface ScanResultCancelled {
  status: "cancelled";
}
export interface ScanResultError {
  status: "error";
  errorCode: string;
  message: string;
}
export type ScanResult = ScanResultOk | ScanResultCancelled | ScanResultError;

/**
 * Same three-shape contract as `ScanResult`, for the on-device package-text
 * OCR capture command (OCR-fallback task spec §2/§3). `rawText` is exactly
 * what ML Kit's Text Recognition v2 recognized — no parsing/structuring
 * happens natively (same "native returns raw data, shared layer parses it"
 * split as barcode scanning, `lib/domain/ocr.ts` does the structuring).
 * The captured photo itself never crosses this bridge at all — the native
 * layer discards the bitmap the moment OCR finishes (spec §3), so there is
 * no `imageData`/`photoUri` field here to accidentally wire up later.
 */
export interface OcrCaptureResultOk {
  status: "ok";
  rawText: string;
}
export interface OcrCaptureResultCancelled {
  status: "cancelled";
}
export interface OcrCaptureResultError {
  status: "error";
  errorCode: string;
  message: string;
}
export type OcrCaptureResult = OcrCaptureResultOk | OcrCaptureResultCancelled | OcrCaptureResultError;

/**
 * Thrown (never resolved as a `ScanResult`) when there's no native shell
 * to actually call — running in a plain browser, or a Median build where
 * the bridge didn't respond at all. Kept distinct from `ScanResultError`
 * (a real native-reported failure) so callers can tell "the camera failed"
 * apart from "there's no camera to ask" and show different copy.
 */
export class MobilePlatformUnavailableError extends Error {
  constructor(message = "Scanning requires the MedTracking mobile app.") {
    super(message);
    this.name = "MobilePlatformUnavailableError";
  }
}

export interface MobilePlatform {
  /**
   * Synchronous, makes no native call — safe to use on mount to decide
   * whether to show/enable a native-only affordance at all, per "detect
   * this and degrade gracefully rather than hanging forever."
   */
  isAvailable(): boolean;
  /**
   * Invokes the native barcode scanner. Resolves with exactly one of the
   * three contract statuses above for any real native response (including
   * a user cancel or a native-reported error — neither of those is a
   * thrown exception). Rejects with `MobilePlatformUnavailableError` only
   * when there's no native shell to respond at all.
   */
  scanBarcode(): Promise<ScanResult>;
  /**
   * Invokes the native on-device package-text OCR capture (OCR-fallback
   * task spec §1/§2) — only ever called after an exact identifier lookup
   * came back `VALID_IDENTIFIER_UNRESOLVED` (spec §1: "do not run OCR
   * unnecessarily when an exact trusted identifier already resolves the
   * package"). Same rejection contract as `scanBarcode`: rejects with
   * `MobilePlatformUnavailableError` only when there's no native shell to
   * respond at all; a user cancel or native-reported failure resolves with
   * the corresponding `OcrCaptureResult` status instead.
   */
  recognizePackageText(): Promise<OcrCaptureResult>;
}
