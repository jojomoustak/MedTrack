// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/client/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { name: " Μαρία Παπαδοπούλου " } } }) },
}));
vi.mock("@/lib/auth/client/use-first-name", () => ({ useFirstName: () => "Μαρία" }));
vi.mock("@/components/shell/CurrentProfileContext", () => ({ useProfileId: () => "profile-1" }));
vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const loadDoctorReport = vi.fn();
vi.mock("@/lib/reports/client/load-doctor-report", () => ({ loadDoctorReport: (...args: unknown[]) => loadDoctorReport(...args) }));

const renderDoctorReportPdf = vi.fn();
vi.mock("@/lib/reports/client/render-doctor-report-pdf", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reports/client/render-doctor-report-pdf")>()),
  loadReportFonts: async () => ({ regular: "R", bold: "B" }),
  renderDoctorReportPdf: (...args: unknown[]) => renderDoctorReportPdf(...args),
}));

const saveFile = vi.fn();
vi.mock("@/lib/platform/save-file", () => ({ saveFile: (...args: unknown[]) => saveFile(...args) }));

const PDF = new Blob(["%PDF-"], { type: "application/pdf" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 12, 0));
  loadDoctorReport.mockImplementation(async (_profileId: string, range: unknown, personName: string | null) => ({ range, personName, createdAt: new Date(), medicines: [], doses: [] }));
  renderDoctorReportPdf.mockResolvedValue(PDF);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  loadDoctorReport.mockReset();
  renderDoctorReportPdf.mockReset();
  saveFile.mockReset();
});

async function renderForm() {
  const { DoctorReportForm } = await import("@/components/profile/DoctorReportForm");
  render(<DoctorReportForm />);
}

describe("DoctorReportForm", () => {
  it("makes the last 30 days by default, for the signed-in person, and saves it as a PDF", async () => {
    await renderForm();
    expect(screen.getByRole("tab", { name: "30 ημέρες" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("17 Σεπτεμβρίου 2026 – 16 Οκτωβρίου 2026")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Δημιουργία PDF" }));

    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledWith(PDF, "medtrack-anafora-2026-09-17-2026-10-16.pdf"));
    expect(loadDoctorReport).toHaveBeenCalledWith("profile-1", { from: new Date(2026, 8, 17), to: new Date(2026, 9, 16, 23, 59, 59, 999) }, "Μαρία Παπαδοπούλου");
    expect(screen.getByRole("status").textContent).toBe("Η αναφορά είναι έτοιμη.");
  });

  it("takes another period", async () => {
    await renderForm();
    fireEvent.click(screen.getByRole("tab", { name: "6 μήνες" }));
    expect(screen.getByText("17 Απριλίου 2026 – 16 Οκτωβρίου 2026")).toBeTruthy();
  });

  it("takes chosen dates, and won't make a report from dates it can't use", async () => {
    await renderForm();
    fireEvent.click(screen.getByRole("tab", { name: "Άλλο διάστημα" }));
    fireEvent.change(screen.getByLabelText("Από"), { target: { value: "2026-10-10" } });
    fireEvent.change(screen.getByLabelText("Έως"), { target: { value: "2026-10-05" } });

    expect(screen.getByText("Η πρώτη ημερομηνία πρέπει να είναι πριν από τη δεύτερη.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Δημιουργία PDF" }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Από"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Δημιουργία PDF" }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledWith(PDF, "medtrack-anafora-2026-10-01-2026-10-05.pdf"));
  });

  it("says so when the report couldn't be made", async () => {
    renderDoctorReportPdf.mockRejectedValue(new Error("boom"));
    await renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Δημιουργία PDF" }));

    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Η αναφορά δεν δημιουργήθηκε. Δοκιμάστε ξανά."));
    expect(saveFile).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
