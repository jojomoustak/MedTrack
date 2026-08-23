// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MedicationPhotoAttach } from "@/components/medications/MedicationPhotoAttach";
import type { UserMedicationRepository } from "@/lib/domain/repositories";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

afterEach(() => cleanup());

beforeEach(() => {
  // jsdom doesn't implement these — stub them so the component's
  // "display the fetched photo blob" path (`URL.createObjectURL`) doesn't
  // throw in tests.
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:fake-url"), revokeObjectURL: vi.fn() });
});

afterEach(() => vi.unstubAllGlobals());

function makeRecord(overrides: Partial<UserMedicationRecord> = {}): UserMedicationRecord {
  return {
    id: "med-1",
    profileId: "profile-1",
    catalogProductId: null,
    customName: "Ασπιρίνη",
    customForm: null,
    customStrengthValue: null,
    customStrengthUnit: null,
    treatmentState: "active",
    inventoryUnit: "tablet",
    lowStockThresholdValue: null,
    expiryWarningDays: 30,
    notes: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    deletedAt: null,
    clientMutationId: "cm-1",
    syncState: "synced",
    ...overrides,
  };
}

function makeRepository(record: UserMedicationRecord | null): UserMedicationRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(record),
    create: vi.fn(),
    applyRemote: vi.fn(),
    markConflict: vi.fn(),
    markFailed: vi.fn(),
  };
}

function notFoundFetch(): Response {
  return new Response(null, { status: 404 });
}

describe("MedicationPhotoAttach", () => {
  it("shows a waiting state (no upload control) while the medication hasn't synced to the server yet", async () => {
    const repository = makeRepository(makeRecord({ syncState: "pending" }));
    const fetchImpl = vi.fn();

    render(<MedicationPhotoAttach userMedicationId="med-1" repository={repository} fetchImpl={fetchImpl} />);

    expect(await screen.findByText(/αναμονή συγχρονισμού/i)).toBeTruthy();
    expect(screen.queryByLabelText(/προσθήκη φωτογραφίας/i)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("once synced, shows the 'add a photo' control when none is attached yet (404)", async () => {
    const repository = makeRepository(makeRecord({ syncState: "synced" }));
    const fetchImpl = vi.fn().mockResolvedValue(notFoundFetch());

    render(<MedicationPhotoAttach userMedicationId="med-1" repository={repository} fetchImpl={fetchImpl} />);

    expect(await screen.findByText(/προσθήκη φωτογραφίας/i)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /φωτογραφία φαρμάκου/i })).toBeNull();
  });

  it("shows the existing photo, and a Remove button, when one is already attached", async () => {
    const repository = makeRepository(makeRecord({ syncState: "synced" }));
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Blob(["bytes"], { type: "image/jpeg" }), { status: 200 }));

    render(<MedicationPhotoAttach userMedicationId="med-1" repository={repository} fetchImpl={fetchImpl} />);

    expect(await screen.findByRole("img", { name: /φωτογραφία φαρμάκου/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /αφαίρεση/i })).toBeTruthy();
  });

  it("uploads a selected file, then refreshes to show it", async () => {
    const repository = makeRepository(makeRecord({ syncState: "synced" }));
    const fetchImpl = vi
      .fn()
      // 1: initial existence check -> no photo yet
      .mockResolvedValueOnce(notFoundFetch())
      // 2: POST upload -> success
      .mockResolvedValueOnce(new Response(JSON.stringify({ uploaded: true }), { status: 200 }))
      // 3: re-fetch after upload -> now present
      .mockResolvedValueOnce(new Response(new Blob(["bytes"], { type: "image/jpeg" }), { status: 200 }));

    render(<MedicationPhotoAttach userMedicationId="med-1" repository={repository} fetchImpl={fetchImpl} />);

    const input = await screen.findByLabelText(/προσθήκη φωτογραφίας/i);
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("img", { name: /φωτογραφία φαρμάκου/i })).toBeTruthy());
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const uploadCall = fetchImpl.mock.calls[1];
    expect(uploadCall[1].method).toBe("POST");
  });

  it("shows a plain-language error for an oversized file WITHOUT making a network request", async () => {
    const repository = makeRepository(makeRecord({ syncState: "synced" }));
    const fetchImpl = vi.fn().mockResolvedValueOnce(notFoundFetch());

    render(<MedicationPhotoAttach userMedicationId="med-1" repository={repository} fetchImpl={fetchImpl} />);

    const input = await screen.findByLabelText(/προσθήκη φωτογραφίας/i);
    const tooBig = new File([new Uint8Array(9 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [tooBig] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/8MB/);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // only the initial existence check — no upload attempt
  });

  it("removes the photo when Αφαίρεση is clicked", async () => {
    const repository = makeRepository(makeRecord({ syncState: "synced" }));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(new Blob(["bytes"], { type: "image/jpeg" }), { status: 200 })) // initial: present
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true }), { status: 200 })); // DELETE

    render(<MedicationPhotoAttach userMedicationId="med-1" repository={repository} fetchImpl={fetchImpl} />);

    fireEvent.click(await screen.findByRole("button", { name: /αφαίρεση/i }));

    await waitFor(() => expect(screen.queryByRole("img", { name: /φωτογραφία φαρμάκου/i })).toBeNull());
    expect(screen.getByText(/προσθήκη φωτογραφίας/i)).toBeTruthy();
  });
});
