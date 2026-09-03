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
 * Phase 11 (native offline reminders, `scheduling-android-reminders`
 * skill, ADR-009/ADR-011) bridge contract. No "cancelled" shape here —
 * unlike scan/OCR there is no user-driven capture flow to abandon; a
 * permission prompt resolves to exactly `granted` or `denied`.
 */
export interface ReminderPermissionGranted {
  status: "granted";
}
export interface ReminderPermissionDenied {
  status: "denied";
}
export interface ReminderPermissionError {
  status: "error";
  errorCode: string;
  message: string;
}
export type ReminderPermissionResult = ReminderPermissionGranted | ReminderPermissionDenied | ReminderPermissionError;

/** Shared two-shape result for the reminder write commands below — these are background sync calls, not user-facing capture flows, so there's no "cancelled" to represent. */
export interface NativeReminderCommandOk {
  status: "ok";
}
export interface NativeReminderCommandError {
  status: "error";
  errorCode: string;
  message: string;
}
export type NativeReminderCommandResult = NativeReminderCommandOk | NativeReminderCommandError;

/**
 * One dose event's near-term reminder, as pushed to native. Phase 11
 * deliberately keeps this 1:1 with a `DoseEvent` from the web side's
 * perspective — the native `ScheduledLocalReminder.id` is always set equal
 * to `doseEventId` for a primary reminder (see `ADR-009`'s doc comment on
 * the entity for why `id`/`doseEventId` are still distinct fields: a
 * user-triggered Snooze creates a second, natively-generated row for the
 * same `doseEventId`, entirely on-device, with no bridge round trip —
 * this shape never represents that row).
 */
export interface UpsertNativeReminderInput {
  doseEventId: string;
  scheduleId: string;
  /** Epoch milliseconds (UTC) this reminder should fire at. */
  triggerAtEpochMs: number;
  /** Health-adjacent display text (CLAUDE.md rule 8) — never logged raw on either side of the bridge. */
  medicationLabel: string;
  doseText: string;
}

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

  /**
   * Requests notification permission, contextually — only ever called at
   * the moment the user turns reminders on (`scheduling-android-reminders`:
   * "explain why, then request", never at app launch). Below API 33 there
   * is no runtime dialog to show; native still resolves `granted`/`denied`
   * from the passive system setting so the caller doesn't need to branch
   * on Android version. Rejects with `MobilePlatformUnavailableError` only
   * when there's no native shell to ask at all.
   */
  requestReminderPermission(): Promise<ReminderPermissionResult>;

  /**
   * Idempotently (re)schedules exactly one native reminder for a dose
   * event — safe to call repeatedly with the same `doseEventId` as its
   * `triggerAtEpochMs` moves (e.g. a DST recompute, or a schedule edit):
   * native replaces the prior `AlarmManager` entry rather than stacking a
   * second one. Callers should call this for every still-`scheduled`
   * DoseEvent within the near-term push window, not just newly-created
   * ones — see `lib/reminders/client/native-reminder-sync.ts`.
   */
  upsertReminder(input: UpsertNativeReminderInput): Promise<NativeReminderCommandResult>;

  /**
   * Cancels every native reminder tied to `doseEventId` — the primary one
   * AND any natively-generated Snooze derivative — and clears their
   * `AlarmManager` entries. Call this the moment a dose event reaches a
   * terminal status (Taken/Skipped/Missed/Cancelled) so a status change
   * made on the web side can never leave a stale native alarm that still
   * fires. A no-op (still resolves `{status:"ok"}`) if nothing was
   * scheduled for this id.
   */
  cancelRemindersForDoseEvent(doseEventId: string): Promise<NativeReminderCommandResult>;
}
