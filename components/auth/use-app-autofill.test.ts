// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { __setMobilePlatformForTests } from "@/lib/platform/get-mobile-platform";
import type { MobilePlatform } from "@/lib/platform/mobile-platform";
import { useAppAutofill } from "@/components/auth/use-app-autofill";

function fakePlatform(available: boolean, setAutofill = vi.fn().mockResolvedValue({ status: "ok" })) {
  __setMobilePlatformForTests({ isAvailable: () => available, setAutofill } as unknown as MobilePlatform);
  return setAutofill;
}

afterEach(() => {
  cleanup();
  __setMobilePlatformForTests(undefined);
});

// Owner-reported 2026-10-20: Google's strong-password pop-up kept closing the keyboard on Create account.
describe("useAppAutofill", () => {
  it("in the app, turns autofill off while a new-password screen is open and back on when it closes", () => {
    const setAutofill = fakePlatform(true);
    const { unmount } = renderHook(() => useAppAutofill(false));
    expect(setAutofill.mock.calls).toEqual([[false]]);

    unmount();
    expect(setAutofill.mock.calls).toEqual([[false], [true]]);
  });

  it("sign-in only makes sure it's on", () => {
    const setAutofill = fakePlatform(true);
    const { unmount } = renderHook(() => useAppAutofill(true));
    unmount();
    expect(setAutofill.mock.calls).toEqual([[true]]);
  });

  it("does nothing in a browser", () => {
    const setAutofill = fakePlatform(false);
    renderHook(() => useAppAutofill(false)).unmount();
    expect(setAutofill).not.toHaveBeenCalled();
  });

  it("an app that doesn't answer changes nothing on the screen", async () => {
    const setAutofill = fakePlatform(true, vi.fn().mockRejectedValue(new Error("no answer")));
    const { unmount } = renderHook(() => useAppAutofill(false));
    unmount();
    await Promise.resolve();
    expect(setAutofill).toHaveBeenCalledTimes(2);
  });
});
