// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReminderPermissionToggle } from "@/components/profile/ReminderPermissionToggle";
import type { MobilePlatform } from "@/lib/platform/mobile-platform";

// The component persists a small "has this device asked before" flag
// (2026-09-18 fix, see the component's own doc comment) — cleared before
// every test so each one starts as a genuine first-time device, matching
// what each test's own name/scenario claims.
beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

function fakePlatform(overrides: Partial<MobilePlatform> = {}): MobilePlatform {
  return {
    isAvailable: () => true,
    scanBarcode: vi.fn(),
    recognizePackageText: vi.fn(),
    requestReminderPermission: vi.fn(),
    upsertReminder: vi.fn().mockResolvedValue({ status: "ok" }),
    cancelRemindersForDoseEvent: vi.fn().mockResolvedValue({ status: "ok" }),
    signInWithGoogle: vi.fn(),
    ...overrides,
  };
}

describe("ReminderPermissionToggle", () => {
  it("shows an explanatory unavailable state instead of a button outside the native shell", () => {
    render(<ReminderPermissionToggle profileId="profile-1" platform={fakePlatform({ isAvailable: () => false })} />);
    expect(screen.getByText(/διαθέσιμες μόνο μέσω της εφαρμογής/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("never calls requestReminderPermission on mount — only on an explicit tap (contextual request)", () => {
    const platform = fakePlatform();
    render(<ReminderPermissionToggle profileId="profile-1" platform={platform} />);
    expect(platform.requestReminderPermission).not.toHaveBeenCalled();
  });

  it("requests permission on tap and shows the granted state", async () => {
    const platform = fakePlatform({ requestReminderPermission: vi.fn().mockResolvedValue({ status: "granted" }) });
    render(<ReminderPermissionToggle profileId="profile-1" platform={platform} />);

    fireEvent.click(screen.getByRole("button", { name: /ενεργοποίηση ειδοποιήσεων/i }));

    await waitFor(() => expect(screen.getByText(/οι ειδοποιήσεις είναι ενεργές/i)).toBeInTheDocument());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the denied state, with the button still available to retry", async () => {
    const platform = fakePlatform({ requestReminderPermission: vi.fn().mockResolvedValue({ status: "denied" }) });
    render(<ReminderPermissionToggle profileId="profile-1" platform={platform} />);

    fireEvent.click(screen.getByRole("button", { name: /ενεργοποίηση ειδοποιήσεων/i }));

    await waitFor(() => expect(screen.getByText(/η άδεια απορρίφθηκε/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /ενεργοποίηση ειδοποιήσεων/i })).toBeInTheDocument();
  });

  it("shows a generic error state when the native call itself rejects (no native shell to respond)", async () => {
    const platform = fakePlatform({ requestReminderPermission: vi.fn().mockRejectedValue(new Error("no bridge")) });
    render(<ReminderPermissionToggle profileId="profile-1" platform={platform} />);

    fireEvent.click(screen.getByRole("button", { name: /ενεργοποίηση ειδοποιήσεων/i }));

    await waitFor(() => expect(screen.getByText(/κάτι πήγε στραβά/i)).toBeInTheDocument());
  });

  // 2026-09-18 bug report: after granting, navigating away from Profile
  // and back (a fresh mount, e.g. after a reload) kept showing "enable
  // notifications" forever — this component had no way to learn a grant
  // that already happened. Covers the fix: a device that has asked before
  // silently re-checks the real status on mount instead of trusting a
  // reset-to-"idle" local state.
  it("re-checks and shows the granted state on mount, once this device has asked before — the reported bug", async () => {
    localStorage.setItem("medtrack:reminder-permission-asked", "1");
    const platform = fakePlatform({ requestReminderPermission: vi.fn().mockResolvedValue({ status: "granted" }) });
    render(<ReminderPermissionToggle profileId="profile-1" platform={platform} />);

    await waitFor(() => expect(screen.getByText(/οι ειδοποιήσεις είναι ενεργές/i)).toBeInTheDocument());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(platform.requestReminderPermission).toHaveBeenCalledTimes(1);
  });

  it("re-checks and shows the denied state on mount for a device that has asked before and was denied", async () => {
    localStorage.setItem("medtrack:reminder-permission-asked", "1");
    const platform = fakePlatform({ requestReminderPermission: vi.fn().mockResolvedValue({ status: "denied" }) });
    render(<ReminderPermissionToggle profileId="profile-1" platform={platform} />);

    await waitFor(() => expect(screen.getByText(/η άδεια απορρίφθηκε/i)).toBeInTheDocument());
  });

  it("marks this device as having asked, on tap, so a later mount can silently re-check", async () => {
    const platform = fakePlatform({ requestReminderPermission: vi.fn().mockResolvedValue({ status: "granted" }) });
    render(<ReminderPermissionToggle profileId="profile-1" platform={platform} />);

    fireEvent.click(screen.getByRole("button", { name: /ενεργοποίηση ειδοποιήσεων/i }));
    await waitFor(() => expect(screen.getByText(/οι ειδοποιήσεις είναι ενεργές/i)).toBeInTheDocument());

    expect(localStorage.getItem("medtrack:reminder-permission-asked")).toBe("1");
  });
});
