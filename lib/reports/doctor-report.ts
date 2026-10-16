/**
 * «Αναφορά για τον γιατρό» (owner's request, 2026-10-16): what this person
 * recorded in MedTrack over a period, laid out for a doctor to read: a
 * summary (counts per medicine, time of day and week), the medicines with
 * their schedule and stock today, then every dose, day by day. Pure: built
 * from records already read from the phone (`client/load-doctor-report.ts`),
 * so it works offline, and drawn into a PDF by `client/render-doctor-report-pdf.ts`.
 *
 * It reports what was recorded, never what it means: counts and shares,
 * no judgement, no advice (CLAUDE.md rule 1).
 */
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import { isTerminalDoseEventStatus } from "@/lib/domain/dose-event";
import type { InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";
import type { MedicationScheduleRecord } from "@/lib/domain/medication-schedule";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import { computeCurrentStock, computeRefillProjection } from "@/lib/domain/inventory-consumption";
import { doseQuantityLabel } from "@/lib/medications/dose-quantity-label";
import { dosageFormLabel, TREATMENT_STATE_LABELS } from "@/lib/medications/labels";
import { describeSchedule, isScheduleCurrent } from "@/lib/medications/schedule-summary";

export type ReportPeriod = "30d" | "3m" | "6m" | "custom";

/** Longest period a report covers: a year of doses is already dozens of pages. */
export const MAX_REPORT_DAYS = 366;

export interface ReportRange {
  /** Start of the first local day. */
  from: Date;
  /** End of the last local day. */
  to: Date;
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** The same day `months` months earlier, kept inside that month (31 May less 3 months is 28 or 29 February, not 3 March). */
function monthsBefore(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() - months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

/** "2026-10-16" (a date input's value) as that local day, or null. */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 ? date : null;
}

/** A date input's value for a local day: "2026-10-16". */
export function toLocalDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type ReportRangeResult = { ok: true; range: ReportRange } | { ok: false; error: string };

/**
 * The days a report covers, today included: the last 30 days, the last 3
 * or 6 months, or a chosen from–to (both days included).
 */
export function reportRange(period: ReportPeriod, now: Date, custom?: { from: string; to: string }): ReportRangeResult {
  const to = endOfLocalDay(now);
  if (period === "30d") {
    const from = startOfLocalDay(now);
    from.setDate(from.getDate() - 29);
    return { ok: true, range: { from, to } };
  }
  if (period === "3m" || period === "6m") {
    const from = startOfLocalDay(monthsBefore(now, period === "3m" ? 3 : 6));
    from.setDate(from.getDate() + 1);
    return { ok: true, range: { from, to } };
  }

  const fromDay = custom ? parseLocalDate(custom.from) : null;
  const toDay = custom ? parseLocalDate(custom.to) : null;
  if (!fromDay || !toDay) return { ok: false, error: "Επιλέξτε και τις δύο ημερομηνίες." };
  if (fromDay > toDay) return { ok: false, error: "Η πρώτη ημερομηνία πρέπει να είναι πριν από τη δεύτερη." };
  if (startOfLocalDay(toDay) > startOfLocalDay(now)) return { ok: false, error: "Η αναφορά φτάνει έως σήμερα." };
  const days = Math.round((startOfLocalDay(toDay).getTime() - fromDay.getTime()) / 86_400_000) + 1;
  if (days > MAX_REPORT_DAYS) return { ok: false, error: "Επιλέξτε διάστημα έως 12 μηνών." };
  return { ok: true, range: { from: startOfLocalDay(fromDay), to: endOfLocalDay(toDay) } };
}

export interface DoctorReportMedicine {
  name: string;
  /** "500 mg · Δισκίο". */
  details: string | null;
  /** One line per running schedule: "2 φορές την ημέρα · 08:00, 20:00 · 1 δισκίο". */
  schedule: string[];
  treatment: string;
  /** "24 δισκία"; null when no stock was ever recorded for it. */
  stock: string | null;
  /** Roughly how many days the stock lasts, at the recent or scheduled rate (`computeRefillProjection`); null when it can't be told. */
  stockDays: number | null;
}

export type DoctorReportDoseStatus = "taken" | "taken_late" | "skipped" | "missed" | "unrecorded";

export const DOSE_STATUS_LABELS: Record<DoctorReportDoseStatus, string> = {
  taken: "Ελήφθη",
  taken_late: "Ελήφθη αργότερα",
  skipped: "Παραλείφθηκε",
  missed: "Χάθηκε",
  // Its time passed and nothing was recorded.
  unrecorded: "Δεν καταγράφηκε",
};

export interface DoctorReportDose {
  /** The scheduled time (the taken time for a dose with none). */
  at: Date;
  /** Local day, "2026-10-16": rows of one day are drawn together. */
  day: string;
  /** False for a dose that had no scheduled time. */
  scheduled: boolean;
  medicine: string;
  quantity: string | null;
  status: DoctorReportDoseStatus;
  takenAt: Date | null;
}

/** How many doses ended each way. */
export interface StatusCounts {
  total: number;
  taken: number;
  takenLate: number;
  skipped: number;
  missed: number;
  unrecorded: number;
}

/** Doses recorded as taken (on time or later), out of all of them; null with none. */
export function takenShare(counts: StatusCounts): number | null {
  return counts.total === 0 ? null : (counts.taken + counts.takenLate) / counts.total;
}

export interface SummaryRow {
  label: string;
  counts: StatusCounts;
}

export interface DoctorReportSummary {
  overall: StatusCounts;
  /** Days of the period with at least one dose. */
  daysWithDoses: number;
  /** Of those, the days every dose was recorded as taken. */
  daysAllTaken: number;
  byMedicine: SummaryRow[];
  /** Scheduled doses only, by the time they were due. */
  byTimeOfDay: SummaryRow[];
  /** Weeks for a period up to about three months, months beyond. */
  byPeriodUnit: "week" | "month";
  byPeriod: SummaryRow[];
}

export interface DoctorReport {
  personName: string | null;
  range: ReportRange;
  createdAt: Date;
  summary: DoctorReportSummary;
  medicines: DoctorReportMedicine[];
  doses: DoctorReportDose[];
}

export interface DoctorReportInput {
  personName: string | null;
  range: ReportRange;
  now: Date;
  /** Live (not deleted) medications. */
  medications: UserMedicationRecord[];
  /** The everyday name per medication id ("FLAGYL 500mg"), for the dose log and summary. */
  names: Map<string, string>;
  /** The full name per medication id ("FLAGYL CAPS 500MG/CAP BTX30"), for the medicines table. */
  fullNames: Map<string, string>;
  strengths: Map<string, string | null>;
  schedules: MedicationScheduleRecord[];
  doseEvents: DoseEventRecord[];
  transactions: InventoryTransactionRecord[];
}

function reportStatus(dose: DoseEventRecord): DoctorReportDoseStatus | null {
  switch (dose.status) {
    case "taken":
    case "taken_late":
    case "skipped":
    case "missed":
      return dose.status;
    case "cancelled":
      return null;
    default:
      return "unrecorded";
  }
}

function emptyCounts(): StatusCounts {
  return { total: 0, taken: 0, takenLate: 0, skipped: 0, missed: 0, unrecorded: 0 };
}

function count(counts: StatusCounts, status: DoctorReportDoseStatus): void {
  counts.total += 1;
  if (status === "taken") counts.taken += 1;
  else if (status === "taken_late") counts.takenLate += 1;
  else if (status === "skipped") counts.skipped += 1;
  else if (status === "missed") counts.missed += 1;
  else counts.unrecorded += 1;
}

/** Time-of-day bands, by the hour a dose was due. */
const TIME_OF_DAY: { label: string; from: number; to: number }[] = [
  { label: "Πρωί (05:00–11:59)", from: 5, to: 11 },
  { label: "Μεσημέρι (12:00–16:59)", from: 12, to: 16 },
  { label: "Απόγευμα (17:00–20:59)", from: 17, to: 20 },
  { label: "Βράδυ (21:00–23:59)", from: 21, to: 23 },
  { label: "Νύχτα (00:00–04:59)", from: 0, to: 4 },
];

const shortDay = (d: Date) => d.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" });

/** Up to this many days the summary goes week by week; longer, month by month. */
const WEEKLY_UP_TO_DAYS = 93;

/** The weeks (Monday to Sunday) or months of the range, clipped to it, each with its label. */
function periodBuckets(range: ReportRange, unit: "week" | "month"): { start: Date; end: Date; label: string }[] {
  const buckets: { start: Date; end: Date; label: string }[] = [];
  let start = startOfLocalDay(range.from);
  while (start <= range.to) {
    let next: Date;
    if (unit === "week") {
      next = new Date(start);
      next.setDate(next.getDate() + ((8 - next.getDay()) % 7 || 7)); // the next Monday
    } else {
      next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    }
    const end = new Date(Math.min(next.getTime() - 1, range.to.getTime()));
    const label =
      unit === "week"
        ? `${shortDay(start)} – ${shortDay(end)}`
        : start.toLocaleDateString("el-GR", { month: "long", year: "numeric" });
    buckets.push({ start, end, label });
    start = next;
  }
  return buckets;
}

function summarize(doses: DoctorReportDose[], range: ReportRange): DoctorReportSummary {
  const overall = emptyCounts();
  const byMedicine = new Map<string, StatusCounts>();
  const byBand = TIME_OF_DAY.map(() => emptyCounts());
  const days = new Map<string, boolean>();

  for (const dose of doses) {
    count(overall, dose.status);
    const medicine = byMedicine.get(dose.medicine) ?? emptyCounts();
    count(medicine, dose.status);
    byMedicine.set(dose.medicine, medicine);
    if (dose.scheduled) {
      const hour = dose.at.getHours();
      count(byBand[TIME_OF_DAY.findIndex((band) => hour >= band.from && hour <= band.to)], dose.status);
    }
    const allTaken = days.get(dose.day) ?? true;
    days.set(dose.day, allTaken && (dose.status === "taken" || dose.status === "taken_late"));
  }

  const spanDays = Math.round((startOfLocalDay(range.to).getTime() - range.from.getTime()) / 86_400_000) + 1;
  const byPeriodUnit = spanDays <= WEEKLY_UP_TO_DAYS ? "week" : "month";
  const byPeriod = periodBuckets(range, byPeriodUnit).map(({ start, end, label }) => {
    const counts = emptyCounts();
    for (const dose of doses) if (dose.at >= start && dose.at <= end) count(counts, dose.status);
    return { label, counts };
  });

  return {
    overall,
    daysWithDoses: days.size,
    daysAllTaken: [...days.values()].filter(Boolean).length,
    byMedicine: [...byMedicine.entries()].sort(([a], [b]) => byName.compare(a, b)).map(([label, counts]) => ({ label, counts })),
    byTimeOfDay: TIME_OF_DAY.map((band, i) => ({ label: band.label, counts: byBand[i] })).filter((row) => row.counts.total > 0),
    byPeriodUnit,
    byPeriod,
  };
}

/** "08:00:00" → "08:00". */
const hhmm = (time: string) => time.slice(0, 5);

/** Each running schedule as one line: how often, at what times, how much. Describes what the person entered, never a recommendation. */
function scheduleLines(schedules: MedicationScheduleRecord[], today: string): string[] {
  return schedules
    .filter((s) => isScheduleCurrent(s, today))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((s) => {
      const times = s.timesOfDay && s.timesOfDay.length > 0 ? [...s.timesOfDay].sort().map(hhmm).join(", ") : null;
      return [describeSchedule(s), times, doseQuantityLabel(s.doseQuantityValue, s.doseQuantityUnit)].filter(Boolean).join(" · ");
    });
}

const byName = new Intl.Collator("el", { sensitivity: "base", numeric: true });

export function buildDoctorReport(input: DoctorReportInput): DoctorReport {
  const { range, now } = input;
  const live = new Map(input.medications.map((med) => [med.id, med]));
  const nameOf = (id: string) => input.names.get(id) ?? input.fullNames.get(id) ?? "Φάρμακο";

  const doses: DoctorReportDose[] = [];
  const dosed = new Set<string>();
  for (const dose of input.doseEvents) {
    // Same as Today and Calendar: a deleted medicine's doses and doses that
    // were called off (the schedule changed) aren't shown.
    if (!live.has(dose.userMedicationId)) continue;
    const status = reportStatus(dose);
    if (!status) continue;
    const when = dose.scheduledAt ?? dose.takenAt;
    if (!when) continue;
    const at = new Date(when);
    if (at < range.from || at > range.to) continue;
    // Still to come: not part of what happened yet.
    if (at > now && !isTerminalDoseEventStatus(dose.status)) continue;
    dosed.add(dose.userMedicationId);
    doses.push({
      at,
      day: toLocalDateInput(at),
      scheduled: dose.scheduledAt !== null,
      medicine: nameOf(dose.userMedicationId),
      quantity: doseQuantityLabel(dose.quantityValue, dose.quantityUnit),
      status,
      takenAt: status === "taken" || status === "taken_late" ? (dose.takenAt ? new Date(dose.takenAt) : null) : null,
    });
  }
  doses.sort((a, b) => a.at.getTime() - b.at.getTime() || byName.compare(a.medicine, b.medicine));

  const today = toLocalDateInput(now);
  // Every medicine being taken or paused, plus any other with doses in the period.
  const medicines = input.medications
    .filter((med) => med.treatmentState === "active" || med.treatmentState === "paused" || dosed.has(med.id))
    .sort((a, b) => byName.compare(nameOf(a.id), nameOf(b.id)))
    .map((med): DoctorReportMedicine => {
      const ownSchedules = input.schedules.filter((s) => s.userMedicationId === med.id && s.deletedAt === null);
      const recorded = input.transactions.some((t) => t.userMedicationId === med.id);
      // Below zero only when more was taken than was ever entered: none left.
      const stock = recorded ? computeCurrentStock(input.transactions, med.id) : null;
      const shownStock = stock !== null && Number(stock) < 0 ? "0" : stock;
      const projection = recorded && med.treatmentState === "active" ? computeRefillProjection(med.id, input.transactions, ownSchedules, now) : null;
      return {
        name: input.fullNames.get(med.id) ?? nameOf(med.id),
        details: [input.strengths.get(med.id) ?? null, dosageFormLabel(med.customForm ?? med.inventoryUnit)].filter(Boolean).join(" · ") || null,
        schedule: scheduleLines(ownSchedules, today),
        treatment: TREATMENT_STATE_LABELS[med.treatmentState],
        stock: shownStock === null ? null : (doseQuantityLabel(shownStock, med.inventoryUnit) ?? shownStock),
        stockDays: projection && projection.basis !== "none" ? projection.daysRemaining : null,
      };
    });

  return { personName: input.personName, range, createdAt: now, summary: summarize(doses, range), medicines, doses };
}
