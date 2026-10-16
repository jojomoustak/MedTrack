import type { jsPDF as JsPdf } from "jspdf";
import type { CellHookData, RowInput } from "jspdf-autotable";
import { DOSE_STATUS_LABELS, takenShare, type DoctorReport, type DoctorReportDoseStatus, type StatusCounts, type SummaryRow } from "@/lib/reports/doctor-report";

/** The app's own typeface, with Greek (`public/fonts/`, SIL Open Font License). Base64 TrueType, as jsPDF takes it. */
export interface ReportFonts {
  regular: string;
  bold: string;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Saved on the phone with the app (the service worker keeps everything in `public/`), so a report can be made offline. */
export async function loadReportFonts(fetchImpl: typeof fetch = fetch): Promise<ReportFonts> {
  const load = async (file: string) => {
    const res = await fetchImpl(`/fonts/${file}`);
    if (!res.ok) throw new Error(`font ${file}: ${res.status}`);
    return toBase64(await res.arrayBuffer());
  };
  const [regular, bold] = await Promise.all([load("Manrope-Regular.ttf"), load("Manrope-Bold.ttf")]);
  return { regular, bold };
}

type Rgb = [number, number, number];

const INK: Rgb = [28, 25, 23]; // stone-900
const MUTED: Rgb = [87, 83, 78]; // stone-600
const FAINT: Rgb = [168, 162, 158]; // stone-400
const RULE: Rgb = [231, 229, 228]; // stone-200
const DAY_FILL: Rgb = [245, 245, 244]; // stone-100
const ACCENT: Rgb = [4, 120, 87]; // accent-700
const ACCENT_FILL: Rgb = [236, 253, 245]; // accent-50

const TAKEN_COLOR: Rgb = [6, 95, 70];
const SKIPPED_COLOR: Rgb = [180, 83, 9];
const MISSED_COLOR: Rgb = [185, 28, 28];

/** Taken in the app's green; not taken in colour too, but always written out: the word carries it, in black-and-white print as well. */
const STATUS_COLORS: Record<DoctorReportDoseStatus, Rgb> = {
  taken: TAKEN_COLOR,
  taken_late: TAKEN_COLOR,
  skipped: SKIPPED_COLOR,
  missed: MISSED_COLOR,
  unrecorded: MUTED,
};

const PAGE_MARGIN = 16;

function longDate(date: Date): string {
  return date.toLocaleDateString("el-GR", { day: "numeric", month: "long", year: "numeric" });
}

/** "Πέμ 16/10/26": fits its column on one line (the period line has the full dates). */
function dayLabel(date: Date): string {
  return date.toLocaleDateString("el-GR", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" }).replace(",", "");
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** "93%". Never rounds up to 100% or down to 0% when that isn't exactly so. */
export function percentLabel(share: number | null): string {
  if (share === null) return "—";
  if (share === 0 || share === 1) return `${share * 100}%`;
  return `${Math.min(99, Math.max(1, Math.round(share * 100)))}%`;
}

function daysLabel(days: number): string {
  if (days < 1) return "για λιγότερο από 1 ημέρα";
  return days === 1 ? "για ≈ 1 ημέρα" : `για ≈ ${days} ημέρες`;
}

export function periodLabel(report: Pick<DoctorReport, "range">): string {
  return `${longDate(report.range.from)} – ${longDate(report.range.to)}`;
}

/** "medtrack-anafora-2026-09-17-2026-10-16.pdf": Latin only, so every phone and mail app keeps it intact. */
export function reportFileName(report: Pick<DoctorReport, "range">): string {
  const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `medtrack-anafora-${day(report.range.from)}-${day(report.range.to)}.pdf`;
}

function lastTableEnd(doc: JsPdf): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

/** Columns of every summary table after its first: how the doses ended. */
const COUNT_HEAD = ["Δόσεις", "Ελήφθη", "Ελήφθη αργότερα", "Παραλείφθηκε", "Χάθηκε", "Δεν καταγράφηκε", "Ποσοστό λήψης"];

function countCells(counts: StatusCounts): string[] {
  return [counts.total, counts.taken, counts.takenLate, counts.skipped, counts.missed, counts.unrecorded].map(String).concat(percentLabel(takenShare(counts)));
}

function addCounts(rows: SummaryRow[]): StatusCounts {
  const sum: StatusCounts = { total: 0, taken: 0, takenLate: 0, skipped: 0, missed: 0, unrecorded: 0 };
  for (const { counts } of rows) for (const key of Object.keys(sum) as (keyof StatusCounts)[]) sum[key] += counts[key];
  return sum;
}

/**
 * Draws the report as an A4 PDF: who and when; a summary (key figures, then
 * counts per medicine, time of day and week or month); the medicines with
 * their schedule and stock; then every dose of the period, one shaded band
 * per day. jsPDF is loaded only here, when a report is made.
 */
export async function renderDoctorReportPdf(report: DoctorReport, fonts: ReportFonts): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("Manrope-Regular.ttf", fonts.regular);
  doc.addFont("Manrope-Regular.ttf", "Manrope", "normal");
  doc.addFileToVFS("Manrope-Bold.ttf", fonts.bold);
  doc.addFont("Manrope-Bold.ttf", "Manrope", "bold");
  doc.setProperties({ title: "Αναφορά φαρμάκων", creator: "MedTrack" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const right = pageWidth - PAGE_MARGIN;
  const { summary } = report;

  // Who, which days, made when.
  let y = PAGE_MARGIN + 2;
  doc.setFont("Manrope", "bold").setFontSize(10).setTextColor(...ACCENT);
  doc.text("MedTrack", PAGE_MARGIN, y);
  doc.setFont("Manrope", "normal").setFontSize(9).setTextColor(...MUTED);
  doc.text(`Δημιουργήθηκε ${longDate(report.createdAt)}, ${timeLabel(report.createdAt)}`, right, y, { align: "right" });

  y += 11;
  doc.setFont("Manrope", "bold").setFontSize(20).setTextColor(...INK);
  doc.text("Αναφορά φαρμάκων", PAGE_MARGIN, y);
  if (report.personName) {
    y += 8;
    doc.setFontSize(13).text(report.personName, PAGE_MARGIN, y);
  }
  y += 7;
  doc.setFont("Manrope", "normal").setFontSize(11).setTextColor(...MUTED);
  doc.text(`Περίοδος: ${periodLabel(report)}`, PAGE_MARGIN, y);

  // Not a clinical tool (CLAUDE.md rule 1): it says what it is.
  y += 6;
  const note = doc.setFontSize(9.5).splitTextToSize("Περιέχει ό,τι καταγράφηκε στην εφαρμογή MedTrack. Δεν αποτελεί ιατρικό έγγραφο ούτε ιατρική συμβουλή.", contentWidth - 8) as string[];
  const noteHeight = note.length * 4.4 + 5;
  doc.setFillColor(...ACCENT_FILL).roundedRect(PAGE_MARGIN, y, contentWidth, noteHeight, 2, 2, "F");
  doc.setTextColor(...INK).text(note, PAGE_MARGIN + 4, y + 6);
  y += noteHeight + 10;

  const tableBase = {
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: PAGE_MARGIN, bottom: PAGE_MARGIN + 6 },
    theme: "plain" as const,
    styles: { font: "Manrope", fontStyle: "normal" as const, fontSize: 9.5, textColor: INK, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, overflow: "linebreak" as const, valign: "middle" as const },
    headStyles: { fontStyle: "bold" as const, fontSize: 9, textColor: MUTED, lineColor: INK, lineWidth: { bottom: 0.3 } },
    bodyStyles: { lineColor: RULE, lineWidth: { bottom: 0.1 } },
  };

  /** A new page when less than `room` mm is left. */
  function ensureRoom(room: number) {
    if (y > pageHeight - PAGE_MARGIN - 6 - room) {
      doc.addPage();
      y = PAGE_MARGIN + 4;
    }
  }

  function sectionHeading(title: string, detail: string) {
    ensureRoom(34);
    doc.setFont("Manrope", "bold").setFontSize(13).setTextColor(...INK);
    doc.text(title, PAGE_MARGIN, y);
    doc.setFont("Manrope", "normal").setFontSize(9.5).setTextColor(...MUTED);
    doc.text(detail, right, y, { align: "right" });
    y += 3;
  }

  function subheading(title: string) {
    ensureRoom(26);
    doc.setFont("Manrope", "bold").setFontSize(10.5).setTextColor(...INK);
    doc.text(title, PAGE_MARGIN, y);
    y += 2;
  }

  /** A summary table: one row per medicine, time of day or week; the count columns right-aligned, zeros faint. */
  function summaryTable(firstColumn: string, rows: SummaryRow[], withTotal: boolean) {
    const numeric = { halign: "right" as const };
    autoTable(doc, {
      ...tableBase,
      startY: y,
      styles: { ...tableBase.styles, fontSize: 9, cellPadding: { top: 1.8, bottom: 1.8, left: 1.5, right: 1.5 } },
      headStyles: { ...tableBase.headStyles, fontSize: 8, valign: "bottom" },
      footStyles: { fontStyle: "bold", textColor: INK, lineColor: INK, lineWidth: { top: 0.3 } },
      head: [[firstColumn, ...COUNT_HEAD]],
      body: rows.map((row) => [row.label, ...countCells(row.counts)]),
      foot: withTotal ? [["Σύνολο", ...countCells(addCounts(rows))]] : undefined,
      showFoot: "lastPage",
      columnStyles: {
        0: { fontStyle: "bold" },
        1: { ...numeric, cellWidth: 14 },
        2: { ...numeric, cellWidth: 15 },
        3: { ...numeric, cellWidth: 17 },
        4: { ...numeric, cellWidth: 24 },
        5: { ...numeric, cellWidth: 15 },
        6: { ...numeric, cellWidth: 22 },
        7: { ...numeric, cellWidth: 17, fontStyle: "bold" },
      },
      didParseCell: (data: CellHookData) => {
        if (data.column.index > 0 && data.section !== "body") data.cell.styles.halign = "right";
        if (data.section !== "body" || data.column.index < 2 || data.column.index > 6) return;
        if (data.cell.raw === "0") data.cell.styles.textColor = FAINT;
        else if (data.column.index === 4) data.cell.styles.textColor = SKIPPED_COLOR;
        else if (data.column.index === 5) data.cell.styles.textColor = MISSED_COLOR;
      },
    });
    y = lastTableEnd(doc) + 8;
  }

  // ── Summary: the key figures, then counts by medicine, time of day and week/month.
  const overall = summary.overall;
  sectionHeading("Σύνοψη", overall.total === 1 ? "1 δόση" : `${overall.total} δόσεις σε ${summary.daysWithDoses} ${summary.daysWithDoses === 1 ? "ημέρα" : "ημέρες"}`);
  if (overall.total === 0) {
    y += 5;
    doc.setFont("Manrope", "normal").setFontSize(10).setTextColor(...MUTED).text("Δεν καταγράφηκαν δόσεις σε αυτή την περίοδο.", PAGE_MARGIN, y);
    y += 12;
  } else {
    y += 2;
    const notTaken = overall.skipped + overall.missed;
    const figures: { label: string; value: string; detail: string; fill: Rgb; color: Rgb }[] = [
      { label: "Ελήφθησαν", value: percentLabel(takenShare(overall)), detail: `${overall.taken + overall.takenLate} από ${overall.total} δόσεις`, fill: ACCENT_FILL, color: TAKEN_COLOR },
      { label: "Ελήφθησαν αργότερα", value: String(overall.takenLate), detail: "μετρούν στις ληφθείσες", fill: DAY_FILL, color: INK },
      { label: "Δεν ελήφθησαν", value: String(notTaken), detail: `${overall.skipped} παραλείφθηκαν · ${overall.missed} χάθηκαν`, fill: DAY_FILL, color: notTaken > 0 ? MISSED_COLOR : INK },
      { label: "Δεν καταγράφηκαν", value: String(overall.unrecorded), detail: "η ώρα τους πέρασε χωρίς σημείωση", fill: DAY_FILL, color: INK },
    ];
    const gap = 3;
    const boxWidth = (contentWidth - gap * (figures.length - 1)) / figures.length;
    const boxHeight = 25;
    figures.forEach((figure, i) => {
      const x = PAGE_MARGIN + i * (boxWidth + gap);
      doc.setFillColor(...figure.fill).roundedRect(x, y, boxWidth, boxHeight, 2, 2, "F");
      doc.setFont("Manrope", "normal").setFontSize(8.5).setTextColor(...MUTED).text(figure.label, x + 3.5, y + 6);
      doc.setFont("Manrope", "bold").setFontSize(18).setTextColor(...figure.color).text(figure.value, x + 3.5, y + 14.5);
      const detail = doc.setFont("Manrope", "normal").setFontSize(7.5).setTextColor(...MUTED).splitTextToSize(figure.detail, boxWidth - 7) as string[];
      doc.text(detail.slice(0, 2), x + 3.5, y + 19.5);
    });
    y += boxHeight + 6;
    doc.setFont("Manrope", "normal").setFontSize(10).setTextColor(...INK);
    doc.text(`Ημέρες με όλες τις δόσεις ληφθείσες: ${summary.daysAllTaken} από ${summary.daysWithDoses}`, PAGE_MARGIN, y);
    y += 9;

    subheading("Ανά φάρμακο");
    summaryTable("Φάρμακο", summary.byMedicine, summary.byMedicine.length > 1);

    if (summary.byTimeOfDay.length > 0) {
      subheading("Ανά ώρα της ημέρας");
      summaryTable("Ώρα", summary.byTimeOfDay, false);
    }

    subheading(summary.byPeriodUnit === "week" ? "Ανά εβδομάδα" : "Ανά μήνα");
    summaryTable(summary.byPeriodUnit === "week" ? "Εβδομάδα" : "Μήνας", summary.byPeriod, false);

    const footnote = doc
      .setFont("Manrope", "normal")
      .setFontSize(8.5)
      .setTextColor(...MUTED)
      .splitTextToSize(
        "Ποσοστό λήψης: οι δόσεις που σημειώθηκαν ως ληφθείσες, στην ώρα τους ή αργότερα, προς όλες τις δόσεις. «Δεν καταγράφηκε»: η ώρα της δόσης πέρασε χωρίς να σημειωθεί τίποτα. Οι αριθμοί δείχνουν μόνο όσα καταγράφηκαν στην εφαρμογή.",
        contentWidth,
      ) as string[];
    ensureRoom(footnote.length * 4);
    y -= 3;
    doc.text(footnote, PAGE_MARGIN, y);
    y += footnote.length * 3.8 + 10;
  }

  // ── The medicines: what they are, their schedule, what's left of each today.
  sectionHeading("Φάρμακα", `Απόθεμα στις ${longDate(report.createdAt)} · οι ημέρες είναι εκτίμηση`);
  if (report.medicines.length === 0) {
    y += 5;
    doc.setFont("Manrope", "normal").setFontSize(10).setTextColor(...MUTED).text("Δεν υπάρχουν φάρμακα σε αυτή την περίοδο.", PAGE_MARGIN, y);
    y += 12;
  } else {
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [["Φάρμακο", "Περιεκτικότητα", "Πρόγραμμα", "Κατάσταση", "Απόθεμα σήμερα"]],
      body: report.medicines.map((m): RowInput => [
        m.name,
        m.details ?? "—",
        m.schedule.length > 0 ? m.schedule.join("\n") : "Χωρίς πρόγραμμα",
        m.treatment,
        m.stock === null ? "Δεν καταγράφεται" : m.stockDays === null ? m.stock : `${m.stock}\n${daysLabel(m.stockDays)}`,
      ]),
      columnStyles: {
        0: { fontStyle: "bold" },
        1: { cellWidth: 30 },
        2: { cellWidth: 47 },
        3: { cellWidth: 24 },
        4: { cellWidth: 31 },
      },
    });
    y = lastTableEnd(doc) + 12;
  }

  // ── Every dose of the period, in order, a shaded band for every other day.
  sectionHeading("Ιστορικό δόσεων", report.doses.length === 1 ? "1 δόση" : `${report.doses.length} δόσεις`);
  if (report.doses.length === 0) {
    y += 5;
    doc.setFont("Manrope", "normal").setFontSize(10).setTextColor(...MUTED).text("Δεν καταγράφηκαν δόσεις σε αυτή την περίοδο.", PAGE_MARGIN, y);
  } else {
    const dayIndex: number[] = [];
    const firstOfDay: boolean[] = [];
    report.doses.forEach((dose, i) => {
      const newDay = i === 0 || report.doses[i - 1].day !== dose.day;
      firstOfDay.push(newDay);
      dayIndex.push(i === 0 ? 0 : dayIndex[i - 1] + (newDay ? 1 : 0));
    });

    let pageOfLastRow = 0;
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [["Ημερομηνία", "Ώρα", "Φάρμακο", "Δόση", "Κατάσταση", "Λήψη"]],
      body: report.doses.map((dose, i) => [
        firstOfDay[i] ? dayLabel(dose.at) : "",
        dose.scheduled ? timeLabel(dose.at) : "—",
        dose.medicine,
        dose.quantity ?? "—",
        DOSE_STATUS_LABELS[dose.status],
        dose.takenAt ? timeLabel(dose.takenAt) : "",
      ]),
      columnStyles: {
        0: { cellWidth: 28, fontStyle: "bold" },
        1: { cellWidth: 14 },
        3: { cellWidth: 24 },
        4: { cellWidth: 36, fontStyle: "bold" },
        5: { cellWidth: 14 },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const i = data.row.index;
        if (dayIndex[i] % 2 === 1) data.cell.styles.fillColor = DAY_FILL;
        if (data.column.index === 4) data.cell.styles.textColor = STATUS_COLORS[report.doses[i].status];
      },
      // A day carried over to a new page gets its date again, so no page starts without one.
      willDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 0) return;
        const startsPage = data.pageNumber !== pageOfLastRow;
        pageOfLastRow = data.pageNumber;
        if (startsPage && !firstOfDay[data.row.index]) data.cell.text = [dayLabel(report.doses[data.row.index].at)];
      },
    });
  }

  // Every page: whose report, which page.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("Manrope", "normal").setFontSize(8).setTextColor(...MUTED);
    const footerY = pageHeight - PAGE_MARGIN + 4;
    doc.text(["MedTrack", report.personName, periodLabel(report)].filter(Boolean).join(" · "), PAGE_MARGIN, footerY);
    doc.text(`Σελίδα ${page} από ${pages}`, right, footerY, { align: "right" });
  }

  return doc.output("blob");
}
