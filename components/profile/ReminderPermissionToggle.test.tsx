// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReminderPermissionToggle } from "@/components/profile/ReminderPermissionToggle";
import type { MobilePlatform } from "@/lib/platform/mobile-platform";

afterEach(() => cleanup());

function fakePlatform(overrides: Partial<MobilePlatform> = {}): MobilePlatform {
  return {
    isAvailable: () => true,
    scanBarcode: vi.fn(),
    recognizePackageText: vi.fn(),
    requestReminderPermission: vi.fn(),
    upsertReminder: vi.fn().mockResolvedValue({ status: "ok" }),
    cancelRemindersForDoseEvent: vi.fn().mockResolvedValue({ status: "ok" }),
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
});
