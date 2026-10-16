// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

afterEach(cleanup);

async function renderSection(props: { itemCount: number; deleting?: boolean; error?: string | null }) {
  const onConfirmDelete = vi.fn();
  const { DeleteListSection } = await import("@/components/lists/DeleteListSection");
  render(<DeleteListSection listName="Φαρμακείο" itemCount={props.itemCount} onConfirmDelete={onConfirmDelete} deleting={props.deleting ?? false} error={props.error ?? null} />);
  return onConfirmDelete;
}

describe("DeleteListSection", () => {
  it("asks first, saying what goes with the list, and deletes only on the second tap", async () => {
    const onConfirmDelete = await renderSection({ itemCount: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Διαγραφή λίστας" }));

    expect(screen.getByText("Η λίστα «Φαρμακείο» και τα 3 είδη της θα διαγραφούν, και από τις άλλες συσκευές σας.")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Άκυρο");
    expect(onConfirmDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Διαγραφή" }));
    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
  });

  it("words an empty list and a one-item list right", async () => {
    await renderSection({ itemCount: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Διαγραφή λίστας" }));
    expect(screen.getByText("Η λίστα «Φαρμακείο» θα διαγραφεί, και από τις άλλες συσκευές σας.")).toBeTruthy();
    cleanup();

    await renderSection({ itemCount: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Διαγραφή λίστας" }));
    expect(screen.getByText("Η λίστα «Φαρμακείο» και το 1 είδος της θα διαγραφούν, και από τις άλλες συσκευές σας.")).toBeTruthy();
  });

  it("can be backed out of", async () => {
    const onConfirmDelete = await renderSection({ itemCount: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Διαγραφή λίστας" }));
    fireEvent.click(screen.getByRole("button", { name: "Άκυρο" }));

    expect(screen.getByRole("button", { name: "Διαγραφή λίστας" })).toBeTruthy();
    expect(onConfirmDelete).not.toHaveBeenCalled();
  });

  it("shows a failure", async () => {
    await renderSection({ itemCount: 2, error: "Η λίστα δεν διαγράφηκε. Δοκιμάστε ξανά." });
    fireEvent.click(screen.getByRole("button", { name: "Διαγραφή λίστας" }));
    expect(screen.getByRole("alert").textContent).toBe("Η λίστα δεν διαγράφηκε. Δοκιμάστε ξανά.");
  });
});
