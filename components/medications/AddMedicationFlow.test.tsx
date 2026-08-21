// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AddMedicationFlow } from "@/components/medications/AddMedicationFlow";
import type { UserMedicationRepository, CreateUserMedicationInput } from "@/lib/domain/repositories";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

afterEach(() => cleanup());

function makeFakeRepository() {
  const create = vi.fn(async (input: CreateUserMedicationInput): Promise<UserMedicationRecord> => ({
    ...input,
    treatmentState: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    deletedAt: null,
    syncState: "pending",
  }));
  const repository: UserMedicationRepository = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create,
    applyRemote: vi.fn(),
    markConflict: vi.fn(),
    markFailed: vi.fn(),
  };
  return { repository, create };
}

describe("AddMedicationFlow — manual entry path end to end", () => {
  it("walks entry chooser -> manual form -> details -> review -> creates a UserMedication with catalogProductId null", async () => {
    const { repository, create } = makeFakeRepository();
    const onCreated = vi.fn();
    render(<AddMedicationFlow profileId="profile-1" repository={repository} onCreated={onCreated} />);

    // 1. Entry chooser
    fireEvent.click(screen.getByRole("button", { name: /χειροκίνητη/i }));

    // 2. Manual entry form
    fireEvent.change(screen.getByLabelText(/όνομα φαρμάκου/i), { target: { value: "Ιβουπροφένη" } });
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));

    // 3. Details step — pick a form, set strength, continue
    fireEvent.click(screen.getByRole("radio", { name: /δισκίο/i }));
    fireEvent.change(screen.getByLabelText(/τιμή περιεκτικότητας/i), { target: { value: "400" } });
    fireEvent.change(screen.getByLabelText(/μονάδα περιεκτικότητας/i), { target: { value: "mg" } });
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));

    // 4. Review & finish
    expect(screen.getByText("Ιβουπροφένη")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /ολοκλήρωση/i }));

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));

    const input = create.mock.calls[0][0] as CreateUserMedicationInput;
    expect(input.profileId).toBe("profile-1");
    expect(input.catalogProductId).toBeNull();
    expect(input.customName).toBe("Ιβουπροφένη");
    expect(input.customForm).toBe("tablet");
    expect(input.customStrengthValue).toBe("400");
    expect(input.customStrengthUnit).toBe("mg");
    expect(input.id).toBeTruthy();
    expect(input.clientMutationId).toBeTruthy();

    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it("shows a plain-language error and stays on the review step if creation fails", async () => {
    const repository: UserMedicationRepository = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockRejectedValue(new Error("boom")),
      applyRemote: vi.fn(),
      markConflict: vi.fn(),
      markFailed: vi.fn(),
    };
    render(<AddMedicationFlow profileId="profile-1" repository={repository} />);

    fireEvent.click(screen.getByRole("button", { name: /χειροκίνητη/i }));
    fireEvent.change(screen.getByLabelText(/όνομα φαρμάκου/i), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));
    fireEvent.click(screen.getByRole("button", { name: /συνέχεια/i }));
    fireEvent.click(screen.getByRole("button", { name: /ολοκλήρωση/i }));

    await vi.waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    // Never a raw error code shown to the user (CLAUDE.md rule 8 / Phase 3 §8).
    expect(screen.getByRole("alert").textContent).not.toMatch(/boom/i);
  });
});
