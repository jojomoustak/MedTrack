import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DoctorReport, DoctorReportDose } from "@/lib/reports/doctor-report";
import { loadReportFonts, renderDoctorReportPdf, reportFileName } from "@/lib/reports/client/render-doctor-report-pdf";

const fontFile = (name: string) => readFileSync(path.join(process.cwd(), "public", "fonts", name));
const FONTS = { regular: fontFile("Manrope-Regular.ttf").toString("base64"), bold: fontFile("Manrope-Bold.ttf").toString("base64") };

function report(doseCount: number): DoctorReport {
  const doses: DoctorReportDose[] = Array.from({ length: doseCount }, (_, i) => {
    const at = new Date(2026, 9, 1 + Math.floor(i / 3), 8 + (i % 3) * 6);
    return {
      at,
      day: `2026-10-${String(at.getDate()).padStart(2, "0")}`,
      scheduled: true,
      medicine: i % 2 ? "FLAGYL 500mg" : "Αλγοφρέν",
      quantity: "1 δισκίο",
      status: i % 7 === 0 ? "missed" : "taken",
      takenAt: i % 7 === 0 ? null : at,
    };
  });
  return {
    personName: "Μαρία Παπαδοπούλου",
    range: { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31, 23, 59) },
    createdAt: new Date(2026, 9, 31, 18, 5),
    medicines: [{ name: "FLAGYL CAPS 500MG/CAP BTX30", strength: "500 mg", form: "Κάψουλα", treatment: "Ενεργό", stock: "24 κάψουλες" }],
    doses,
  };
}

async function pdfText(blob: Blob): Promise<string> {
  return Buffer.from(await blob.arrayBuffer()).toString("latin1");
}

describe("renderDoctorReportPdf", () => {
  it("draws a PDF with the app's typeface embedded, for Greek", async () => {
    const blob = await renderDoctorReportPdf(report(6), FONTS);
    const raw = await pdfText(blob);
    expect(raw.startsWith("%PDF-")).toBe(true);
    // Both weights embedded (not a built-in font, which has no Greek).
    expect(raw.match(/\/FontFile2/g)).toHaveLength(2);
    expect(raw).toContain("/BaseFont /Manrope");
    expect(raw.match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it("runs onto more pages for a long period", async () => {
    const raw = await pdfText(await renderDoctorReportPdf(report(93), FONTS));
    expect(raw.match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(2);
  });

  it("draws an empty period too", async () => {
    const empty = { ...report(0), medicines: [] };
    const raw = await pdfText(await renderDoctorReportPdf(empty, FONTS));
    expect(raw.startsWith("%PDF-")).toBe(true);
  });

  it("names the file by its period, in Latin letters", () => {
    expect(reportFileName(report(0))).toBe("medtrack-anafora-2026-10-01-2026-10-31.pdf");
  });
});

describe("loadReportFonts", () => {
  it("loads both weights from the app's own files", async () => {
    const requested: string[] = [];
    const fetchImpl = (async (url: string) => {
      requested.push(url);
      return new Response(new Uint8Array([1, 2, 3]));
    }) as unknown as typeof fetch;
    await expect(loadReportFonts(fetchImpl)).resolves.toEqual({ regular: "AQID", bold: "AQID" });
    expect(requested).toEqual(["/fonts/Manrope-Regular.ttf", "/fonts/Manrope-Bold.ttf"]);
  });

  it("fails when a font can't be loaded, rather than drawing without Greek", async () => {
    const fetchImpl = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(loadReportFonts(fetchImpl)).rejects.toThrow("404");
  });
});
