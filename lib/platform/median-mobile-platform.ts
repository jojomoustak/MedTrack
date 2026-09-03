"use client";

import {
  MobilePlatformUnavailableError,
  type MobilePlatform,
  type NativeReminderCommandResult,
  type OcrCaptureResult,
  type ReminderPermissionResult,
  type ScanResult,
  type UpsertNativeReminderInput,
} from "@/lib/platform/mobile-platform";
import type { BarcodeFormat } from "@/lib/domain/gs1";
import { logger } from "@/lib/logging/logger";

/**
 * Defense-in-depth timeout for the case `isAvailable()` false-positives
 * (e.g. a Median build that sets its usual signals but whose bridge isn't
 * actually listening for some reason) — without this, a broken bridge
 * would leave the returned Promise unresolved forever, per the task's
 * explicit "rather than hanging forever" requirement. Generous on
 * purpose: this is not a UX timeout for "the user is slow to aim the
 * camera," only a backstop against a bridge that will genuinely never
 * respond.
 */
const SCAN_TIMEOUT_MS = 120_000;

/** Same defense-in-depth reasoning as `SCAN_TIMEOUT_MS`, but a permission dialog is expected to resolve faster than a user aiming a camera. */
const REMINDER_PERMISSION_TIMEOUT_MS = 60_000;

/** Reminder write commands (`upsertReminder`/`cancelRemindersForDoseEvent`) are background sync calls with no user waiting on them — a local Room write + AlarmManager call, so a much tighter backstop than the user-paced commands above is correct here. */
const REMINDER_COMMAND_TIMEOUT_MS = 10_000;

const KNOWN_FORMATS: readonly BarcodeFormat[] = ["GS1_DATA_MATRIX", "EAN_13", "EAN_8", "CODE_128", "UNKNOWN"];

type WindowWithMedian = Window & { median?: unknown };
type WindowWithCallbacks = Window & Record<string, unknown>;

/**
 * Median injects a `window.median` bridge object into every page running
 * inside its WebView — the primary, synchronous "are we even inside the
 * native shell" signal, checked before ever attempting a bridge call (so
 * a plain-browser tester never triggers a `median://` navigation that
 * would just silently no-op). Falls back to a user-agent substring
 * Median's WebView is documented to set, in case a given Median build
 * doesn't inject the object — a weaker, spoofable secondary signal, not
 * the primary one, which is why `scanBarcode()` below still carries its
 * own timeout on top of this check.
 */
function hasMedianBridge(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as WindowWithMedian;
  if (typeof w.median !== "undefined") return true;
  return /median/i.test(window.navigator?.userAgent ?? "");
}

function buildCallbackName(prefix: string): string {
  return `__medtracking${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Shared bridge-call plumbing behind both `scanBarcode` and
 * `recognizePackageText` (OCR-fallback task spec §2): register a one-off
 * JS callback, navigate to `median://medtracking/<command>?callback=...`,
 * resolve/reject/timeout exactly like `scanBarcode` always did. Extracted
 * once a second command needed the identical callback-registration/
 * cleanup/timeout dance, rather than duplicating it — the timeout/cleanup
 * logic is exactly the kind of thing that's easy to fix in one place and
 * easy to silently diverge if copy-pasted.
 */
function callBridgeCommand<T>(
  command: string,
  callbackPrefix: string,
  normalize: (payload: unknown) => T,
  timeoutMs = SCAN_TIMEOUT_MS,
  extraParams?: Record<string, string>,
): Promise<T> {
  if (!hasMedianBridge()) {
    return Promise.reject(new MobilePlatformUnavailableError());
  }

  return new Promise<T>((resolve, reject) => {
    const callbackName = buildCallbackName(callbackPrefix);
    const win = window as unknown as WindowWithCallbacks;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      delete win[callbackName];
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      logger.warn("mobile_platform.bridge_call.timeout", { command, timeoutMs });
      reject(new MobilePlatformUnavailableError("The mobile app didn't respond. Please try again."));
    }, timeoutMs);

    win[callbackName] = (payload: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        resolve(normalize(payload));
      } catch (err) {
        logger.warn("mobile_platform.bridge_call.malformed_response", { command, message: (err as Error).message });
        reject(new MobilePlatformUnavailableError("The mobile app returned an unexpected response."));
      }
    };

    const params = new URLSearchParams({ callback: callbackName, ...extraParams });
    window.location.href = `median://medtracking/${command}?${params.toString()}`;
  });
}

function normalizeOcrResult(payload: unknown): OcrCaptureResult {
  const data = typeof payload === "string" ? (JSON.parse(payload) as unknown) : payload;
  if (typeof data !== "object" || data === null || !("status" in data)) {
    throw new Error("OCR callback payload is missing 'status'.");
  }
  const status = (data as { status: unknown }).status;

  if (status === "ok") {
    const { rawText } = data as { rawText?: unknown };
    if (typeof rawText !== "string") {
      throw new Error("OCR callback 'ok' payload is missing a string 'rawText'.");
    }
    return { status: "ok", rawText };
  }
  if (status === "cancelled") return { status: "cancelled" };
  if (status === "error") {
    const { errorCode, message } = data as { errorCode?: unknown; message?: unknown };
    return {
      status: "error",
      errorCode: typeof errorCode === "string" ? errorCode : "UNKNOWN_ERROR",
      message: typeof message === "string" ? message : "Unknown OCR error.",
    };
  }
  throw new Error(`OCR callback returned an unrecognized status: ${String(status)}`);
}

function normalizeScanResult(payload: unknown): ScanResult {
  const data = typeof payload === "string" ? (JSON.parse(payload) as unknown) : payload;
  if (typeof data !== "object" || data === null || !("status" in data)) {
    throw new Error("Scan callback payload is missing 'status'.");
  }

  const status = (data as { status: unknown }).status;

  if (status === "ok") {
    const { rawValue, format } = data as { rawValue?: unknown; format?: unknown };
    if (typeof rawValue !== "string") {
      throw new Error("Scan callback 'ok' payload is missing a string 'rawValue'.");
    }
    const normalizedFormat: BarcodeFormat = KNOWN_FORMATS.includes(format as BarcodeFormat) ? (format as BarcodeFormat) : "UNKNOWN";
    return { status: "ok", rawValue, format: normalizedFormat };
  }

  if (status === "cancelled") return { status: "cancelled" };

  if (status === "error") {
    const { errorCode, message } = data as { errorCode?: unknown; message?: unknown };
    return {
      status: "error",
      errorCode: typeof errorCode === "string" ? errorCode : "UNKNOWN_ERROR",
      message: typeof message === "string" ? message : "Unknown scan error.",
    };
  }

  throw new Error(`Scan callback returned an unrecognized status: ${String(status)}`);
}

function normalizeReminderPermissionResult(payload: unknown): ReminderPermissionResult {
  const data = typeof payload === "string" ? (JSON.parse(payload) as unknown) : payload;
  if (typeof data !== "object" || data === null || !("status" in data)) {
    throw new Error("Reminder permission callback payload is missing 'status'.");
  }
  const status = (data as { status: unknown }).status;

  if (status === "granted") return { status: "granted" };
  if (status === "denied") return { status: "denied" };
  if (status === "error") {
    const { errorCode, message } = data as { errorCode?: unknown; message?: unknown };
    return {
      status: "error",
      errorCode: typeof errorCode === "string" ? errorCode : "UNKNOWN_ERROR",
      message: typeof message === "string" ? message : "Unknown reminder-permission error.",
    };
  }
  throw new Error(`Reminder permission callback returned an unrecognized status: ${String(status)}`);
}

function normalizeNativeReminderCommandResult(payload: unknown): NativeReminderCommandResult {
  const data = typeof payload === "string" ? (JSON.parse(payload) as unknown) : payload;
  if (typeof data !== "object" || data === null || !("status" in data)) {
    throw new Error("Reminder command callback payload is missing 'status'.");
  }
  const status = (data as { status: unknown }).status;

  if (status === "ok") return { status: "ok" };
  if (status === "error") {
    const { errorCode, message } = data as { errorCode?: unknown; message?: unknown };
    return {
      status: "error",
      errorCode: typeof errorCode === "string" ? errorCode : "UNKNOWN_ERROR",
      message: typeof message === "string" ? message : "Unknown reminder-command error.",
    };
  }
  throw new Error(`Reminder command callback returned an unrecognized status: ${String(status)}`);
}

/**
 * `MobilePlatform` implementation over Median's JS bridge (ADR-005). Uses
 * Median's own navigation-URL bridge convention: navigating to
 * `median://medtracking/scan?callback=<name>` triggers the native scan
 * command, which later invokes the named function on `window` with the
 * JSON result (Phase 8 bridge contract).
 */
export class MedianMobilePlatform implements MobilePlatform {
  isAvailable(): boolean {
    return hasMedianBridge();
  }

  scanBarcode(): Promise<ScanResult> {
    return callBridgeCommand("scan", "Scan", normalizeScanResult);
  }

  /**
   * `median://medtracking/recognizePackageText` — the OCR-fallback task's
   * new bridge command (spec §2), routed through the exact same
   * `callBridgeCommand` plumbing `scanBarcode` uses. See
   * `PackageOcrHandler.kt`/`PackageOcrActivity.kt` for the native side —
   * this method never sees the captured photo, only the recognized text.
   */
  recognizePackageText(): Promise<OcrCaptureResult> {
    return callBridgeCommand("recognizePackageText", "RecognizePackageText", normalizeOcrResult);
  }

  requestReminderPermission(): Promise<ReminderPermissionResult> {
    return callBridgeCommand("requestReminderPermission", "RequestReminderPermission", normalizeReminderPermissionResult, REMINDER_PERMISSION_TIMEOUT_MS);
  }

  upsertReminder(input: UpsertNativeReminderInput): Promise<NativeReminderCommandResult> {
    return callBridgeCommand("upsertReminder", "UpsertReminder", normalizeNativeReminderCommandResult, REMINDER_COMMAND_TIMEOUT_MS, {
      // `id` is always the doseEventId for a primary reminder (see
      // `UpsertNativeReminderInput`'s doc) — passed explicitly rather than
      // left for native to assume, so the wire contract stays self-describing.
      id: input.doseEventId,
      doseEventId: input.doseEventId,
      scheduleId: input.scheduleId,
      triggerAtMillis: String(input.triggerAtEpochMs),
      medicationLabel: input.medicationLabel,
      doseText: input.doseText,
    });
  }

  cancelRemindersForDoseEvent(doseEventId: string): Promise<NativeReminderCommandResult> {
    return callBridgeCommand("cancelRemindersForDoseEvent", "CancelRemindersForDoseEvent", normalizeNativeReminderCommandResult, REMINDER_COMMAND_TIMEOUT_MS, {
      doseEventId,
    });
  }
}
