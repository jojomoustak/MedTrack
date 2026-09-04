// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PackageList } from "@/components/medications/PackageList";
import { MedTrackingDexie, __setClientDbForTests } from "@/lib/db-client/dexie";
import type { MedicationPackageRecord } from "@/lib/domain/medication-package";
import type { InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";

afterEach(() => {
  cleanup();
  __setClientDbForTests(undefined);
});

function pkg(overrides: Partial<MedicationPackageRecord> = {}): MedicationPackageRecord {
  return {
    id: "pkg-1",
    profileId: "profile-1",
    userMedicationId: "med-1",
    source: "manual",
    gtin: null,
    batchNumber: "LOT1",
    serialNumber: null,
    expiryDate: "2026-06-01",
    receivedDate: "2026-01-01",
    initialQuantityValue: "30",
    quantityUnit: "tablet",
    status: "unopened",
    openedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    deletedAt: null,
    clientMutationId: "cmid-pkg",
    syncState: "synced",
    ...overrides,
  };
}

describe("PackageList", () => {
  it("shows an empty-state message when there are no packages", () => {
    render(<PackageList profileId="profile-1" packages={[]} transactions={[]} onChanged={vi.fn()} />);
    expect(screen.getByText(/Δεν έχετε προσθέσει/)).toBeInTheDocument();
  });

  it("sorts packages by soonest expiry first", () => {
    const packages = [pkg({ id: "later", expiryDate: "2026-09-01", batchNumber: "LATER" }), pkg({ id: "soonest", expiryDate: "2026-02-01", batchNumber: "SOONEST" })];
    render(<PackageList profileId="profile-1" packages={packages} transactions={[]} onChanged={vi.fn()} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("SOONEST");
    expect(items[1]).toHaveTextContent("LATER");
  });

  it("shows derived remaining stock against the initial quantity", () => {
    const packages = [pkg({ id: "pkg-1", status: "opened", initialQuantityValue: "30" })];
    const transactions: InventoryTransactionRecord[] = [
      {
        id: "t1",
        profileId: "profile-1",
        userMedicationId: "med-1",
        packageId: "pkg-1",
        transactionType: "package_opened",
        quantityDelta: "30",
        quantityUnit: "tablet",
        doseEventId: null,
        occurredAt: "2026-01-01T00:00:00.000Z",
        recordedAt: "2026-01-01T00:00:00.000Z",
        source: "user",
        note: null,
        clientMutationId: "cm1",
        syncState: "synced",
      },
      {
        id: "t2",
        profileId: "profile-1",
        userMedicationId: "med-1",
        packageId: "pkg-1",
        transactionType: "dose_taken",
        quantityDelta: "-2",
        quantityUnit: "tablet",
        doseEventId: "dose-1",
        occurredAt: "2026-01-02T00:00:00.000Z",
        recordedAt: "2026-01-02T00:00:00.000Z",
        source: "user",
        note: null,
        clientMutationId: "cm2",
        syncState: "synced",
      },
    ];
    render(<PackageList profileId="profile-1" packages={packages} transactions={transactions} onChanged={vi.fn()} />);
    expect(screen.getByText(/28 \/ 30/)).toBeInTheDocument();
  });

  it("only offers 'Άνοιγμα' for an unopened package, and 'Απόρριψη' for an opened one", () => {
    const packages = [pkg({ id: "unopened-pkg", status: "unopened" }), pkg({ id: "opened-pkg", status: "opened" })];
    render(<PackageList profileId="profile-1" packages={packages} transactions={[]} onChanged={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: "Άνοιγμα" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Απόρριψη" })).toHaveLength(1);
  });

  it("depleted/discarded/expired packages have no action button", () => {
    const packages = [pkg({ id: "p1", status: "depleted" }), pkg({ id: "p2", status: "discarded" }), pkg({ id: "p3", status: "expired" })];
    render(<PackageList profileId="profile-1" packages={packages} transactions={[]} onChanged={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opening a package writes both the status update and a package_opened ledger transaction, then calls onChanged", async () => {
    const db = new MedTrackingDexie(`test-package-list-${crypto.randomUUID()}`);
    __setClientDbForTests(db);
    const p = pkg({ id: "pkg-1", status: "unopened", initialQuantityValue: "30" });
    await db.medicationPackage.add(p);

    const onChanged = vi.fn();
    render(<PackageList profileId="profile-1" packages={[p]} transactions={[]} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Άνοιγμα" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    const updatedPackage = await db.medicationPackage.get("pkg-1");
    expect(updatedPackage?.status).toBe("opened");
    expect(updatedPackage?.openedAt).not.toBeNull();

    const transactions = await db.inventoryTransaction.where("packageId").equals("pkg-1").toArray();
    expect(transactions).toHaveLength(1);
    expect(transactions[0].transactionType).toBe("package_opened");
    expect(transactions[0].quantityDelta).toBe("30");

    await db.delete();
  });
});
