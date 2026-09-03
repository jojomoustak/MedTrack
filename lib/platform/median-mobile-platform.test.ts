// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MedianMobilePlatform } from "@/lib/platform/median-mobile-platform";
import { MobilePlatformUnavailableError } from "@/lib/platform/mobile-platform";

/** Replaces `window.location` with a plain mutable object so `href = "median://..."` is observable without jsdom attempting a real navigation. */
function stubLocation() {
  const location = { href: "" };
  Object.defineProperty(window, "location", { value: location, writable: true, configurable: true });
  return location;
}

/**
 * Simulates Median's native side invoking the named callback it was
 * given, exactly the way the bridge contract describes: a JSON argument
 * to a function on `window`. Picks the MOST RECENTLY added matching key
 * (not just the first) so a still-pending callback left over from an
 * earlier test in the same file — e.g. one that deliberately never
 * settles — can't be mistaken for the current call's callback.
 */
function invokeNativeCallback(payload: unknown, asJsonString = false, prefix = "Scan") {
  const matches = Object.keys(window).filter((key) => key.startsWith(`__medtracking${prefix}_`));
  const callbackName = matches[matches.length - 1];
  expect(callbackName).toBeTruthy();
  const fn = (window as unknown as Record<string, (arg: unknown) => void>)[callbackName!];
  fn(asJsonString ? JSON.stringify(payload) : payload);
}

describe("MedianMobilePlatform.isAvailable()", () => {
  const originalMedian = (window as unknown as { median?: unknown }).median;

  afterEach(() => {
    (window as unknown as { median?: unknown }).median = originalMedian;
  });

  it("returns true when window.median is injected (the primary Median signal)", () => {
    (window as unknown as { median?: unknown }).median = {};
    expect(new MedianMobilePlatform().isAvailable()).toBe(true);
  });

  it("returns false in a plain browser with no Median signal at all", () => {
    delete (window as unknown as { median?: unknown }).median;
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 (plain browser)", configurable: true });
    expect(new MedianMobilePlatform().isAvailable()).toBe(false);
  });
});

describe("MedianMobilePlatform.scanBarcode()", () => {
  beforeEach(() => {
    (window as unknown as { median?: unknown }).median = {};
    stubLocation();
  });

  afterEach(() => {
    delete (window as unknown as { median?: unknown }).median;
    vi.useRealTimers();
  });

  it("rejects with MobilePlatformUnavailableError immediately, without navigating, when no native shell is present", async () => {
    delete (window as unknown as { median?: unknown }).median;
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 (plain browser)", configurable: true });
    const location = stubLocation();

    await expect(new MedianMobilePlatform().scanBarcode()).rejects.toBeInstanceOf(MobilePlatformUnavailableError);
    expect(location.href).toBe("");
  });

  it("navigates to the exact median://medtracking/scan?callback=<name> bridge URL", async () => {
    const location = stubLocation();
    const promise = new MedianMobilePlatform().scanBarcode();
    expect(location.href).toMatch(/^median:\/\/medtracking\/scan\?callback=__medtrackingScan_/);
    // Settle it so this test doesn't leak a still-pending callback/timer into later tests.
    invokeNativeCallback({ status: "cancelled" });
    await promise;
  });

  it("resolves with the success shape when the native callback fires with status 'ok'", async () => {
    const promise = new MedianMobilePlatform().scanBarcode();
    invokeNativeCallback({ status: "ok", rawValue: "5201234567890", format: "EAN_13" });
    await expect(promise).resolves.toEqual({ status: "ok", rawValue: "5201234567890", format: "EAN_13" });
  });

  it("also accepts the callback payload as a JSON string, not just an object", async () => {
    const promise = new MedianMobilePlatform().scanBarcode();
    invokeNativeCallback({ status: "ok", rawValue: "123", format: "CODE_128" }, true);
    await expect(promise).resolves.toEqual({ status: "ok", rawValue: "123", format: "CODE_128" });
  });

  it("resolves with { status: 'cancelled' } — never a rejection — when the user cancels", async () => {
    const promise = new MedianMobilePlatform().scanBarcode();
    invokeNativeCallback({ status: "cancelled" });
    await expect(promise).resolves.toEqual({ status: "cancelled" });
  });

  it("resolves with the native error shape — never a rejection — on a native-reported error", async () => {
    const promise = new MedianMobilePlatform().scanBarcode();
    invokeNativeCallback({ status: "error", errorCode: "CAMERA_PERMISSION_DENIED", message: "Camera access was denied." });
    await expect(promise).resolves.toEqual({
      status: "error",
      errorCode: "CAMERA_PERMISSION_DENIED",
      message: "Camera access was denied.",
    });
  });

  it("removes the named callback from window after it resolves, leaving no leaked globals", async () => {
    const promise = new MedianMobilePlatform().scanBarcode();
    const nameBefore = Object.keys(window).find((key) => key.startsWith("__medtrackingScan_"))!;
    invokeNativeCallback({ status: "cancelled" });
    await promise;
    expect((window as unknown as Record<string, unknown>)[nameBefore]).toBeUndefined();
  });

  it("rejects with MobilePlatformUnavailableError if the bridge never calls back at all (defense-in-depth timeout)", async () => {
    vi.useFakeTimers();
    const promise = new MedianMobilePlatform().scanBarcode();
    const assertion = expect(promise).rejects.toBeInstanceOf(MobilePlatformUnavailableError);
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
  });
});

describe("MedianMobilePlatform.requestReminderPermission()", () => {
  beforeEach(() => {
    (window as unknown as { median?: unknown }).median = {};
    stubLocation();
  });

  afterEach(() => {
    delete (window as unknown as { median?: unknown }).median;
    vi.useRealTimers();
  });

  it("navigates to median://medtracking/requestReminderPermission?callback=...", async () => {
    const location = stubLocation();
    const promise = new MedianMobilePlatform().requestReminderPermission();
    expect(location.href).toMatch(/^median:\/\/medtracking\/requestReminderPermission\?callback=__medtrackingRequestReminderPermission_/);
    invokeNativeCallback({ status: "denied" }, false, "RequestReminderPermission");
    await promise;
  });

  it("resolves { status: 'granted' } when the native callback reports granted", async () => {
    const promise = new MedianMobilePlatform().requestReminderPermission();
    invokeNativeCallback({ status: "granted" }, false, "RequestReminderPermission");
    await expect(promise).resolves.toEqual({ status: "granted" });
  });

  it("resolves { status: 'denied' } — never a rejection — when the user denies", async () => {
    const promise = new MedianMobilePlatform().requestReminderPermission();
    invokeNativeCallback({ status: "denied" }, false, "RequestReminderPermission");
    await expect(promise).resolves.toEqual({ status: "denied" });
  });

  it("resolves the native error shape on a native-reported error", async () => {
    const promise = new MedianMobilePlatform().requestReminderPermission();
    invokeNativeCallback({ status: "error", errorCode: "INTERNAL", message: "boom" }, false, "RequestReminderPermission");
    await expect(promise).resolves.toEqual({ status: "error", errorCode: "INTERNAL", message: "boom" });
  });

  it("rejects with MobilePlatformUnavailableError when no native shell is present", async () => {
    delete (window as unknown as { median?: unknown }).median;
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 (plain browser)", configurable: true });
    await expect(new MedianMobilePlatform().requestReminderPermission()).rejects.toBeInstanceOf(MobilePlatformUnavailableError);
  });
});

describe("MedianMobilePlatform.upsertReminder()", () => {
  beforeEach(() => {
    (window as unknown as { median?: unknown }).median = {};
    stubLocation();
  });

  afterEach(() => {
    delete (window as unknown as { median?: unknown }).median;
    vi.useRealTimers();
  });

  it("navigates with id set equal to doseEventId, plus every other field, url-encoded", async () => {
    const location = stubLocation();
    const promise = new MedianMobilePlatform().upsertReminder({
      doseEventId: "dose-1",
      scheduleId: "schedule-1",
      triggerAtEpochMs: 1_700_000_000_000,
      medicationLabel: "Depon 500mg",
      doseText: "1 δισκίο",
    });
    const url = new URL(location.href);
    expect(url.protocol + "//" + url.host + url.pathname).toBe("median://medtracking/upsertReminder");
    expect(url.searchParams.get("id")).toBe("dose-1");
    expect(url.searchParams.get("doseEventId")).toBe("dose-1");
    expect(url.searchParams.get("scheduleId")).toBe("schedule-1");
    expect(url.searchParams.get("triggerAtMillis")).toBe("1700000000000");
    expect(url.searchParams.get("medicationLabel")).toBe("Depon 500mg");
    expect(url.searchParams.get("doseText")).toBe("1 δισκίο");

    invokeNativeCallback({ status: "ok" }, false, "UpsertReminder");
    await expect(promise).resolves.toEqual({ status: "ok" });
  });

  it("rejects with MobilePlatformUnavailableError when no native shell is present", async () => {
    delete (window as unknown as { median?: unknown }).median;
    Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 (plain browser)", configurable: true });
    await expect(
      new MedianMobilePlatform().upsertReminder({
        doseEventId: "dose-1",
        scheduleId: "schedule-1",
        triggerAtEpochMs: 0,
        medicationLabel: "x",
        doseText: "y",
      }),
    ).rejects.toBeInstanceOf(MobilePlatformUnavailableError);
  });
});

describe("MedianMobilePlatform.cancelRemindersForDoseEvent()", () => {
  beforeEach(() => {
    (window as unknown as { median?: unknown }).median = {};
    stubLocation();
  });

  afterEach(() => {
    delete (window as unknown as { median?: unknown }).median;
    vi.useRealTimers();
  });

  it("navigates with the doseEventId and resolves the native result", async () => {
    const location = stubLocation();
    const promise = new MedianMobilePlatform().cancelRemindersForDoseEvent("dose-1");
    const url = new URL(location.href);
    expect(url.searchParams.get("doseEventId")).toBe("dose-1");

    invokeNativeCallback({ status: "ok" }, false, "CancelRemindersForDoseEvent");
    await expect(promise).resolves.toEqual({ status: "ok" });
  });

  it("resolves the native error shape on a native-reported error", async () => {
    const promise = new MedianMobilePlatform().cancelRemindersForDoseEvent("dose-1");
    invokeNativeCallback({ status: "error", errorCode: "INTERNAL", message: "boom" }, false, "CancelRemindersForDoseEvent");
    await expect(promise).resolves.toEqual({ status: "error", errorCode: "INTERNAL", message: "boom" });
  });
});
