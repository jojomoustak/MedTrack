/**
 * «Αναφορά για τον γιατρό» (owner's request, 2026-10-16): what this person
 * recorded in MedTrack over a period, laid out for a doctor to read — their
 * medicines with today's stock, then every dose, day by day. Pure: built
 * from records already read from the phone (`client/load-doctor-report.ts`),
 * so it works offline, and drawn into a PDF by `client/render-doctor-report-pdf.ts`.
 *
 * It reports what was recorded, never what it means: no judgement, no
 * score, no advice (CLAUDE.md rule 1).
 */
import type { DoseEventRecord } from "@/lib/domain/dose-event";
import { isTerminalDoseEventStatus } from "@/lib/domain/dose-event";
import type { InventoryTransactionRecord } from "@/lib/domain/inventory-transaction";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";
import { computeCurrentStock } from "@/lib/domain/inventory-consumption";
import { doseQuantityLabel } from "@/lib/medications/dose-quantity-label";
import { dosageFormLabel, TREATMENT_STATE_LABELS } from "@/lib/medications/labels";

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
  strength: string | null;
  form: string | null;
  treatment: string;
  /** "24 δισκία"; null when no stock was ever recorded for it. */
  stock: string | null;
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

export interface DoctorReport {
  personName: string | null;
  range: ReportRange;
  createdAt: Date;
  medicines: DoctorReportMedicine[];
  doses: DoctorReportDose[];
}

export interface DoctorReportInput {
  personName: string | null;
  range: ReportRange;
  now: Date;
  /** Live (not deleted) medications. */
  medications: UserMedicationRecord[];
  /** The everyday name per medication id ("FLAGYL 500mg"), for the dose log. */
  names: Map<string, string>;
  /** The full name per medication id ("FLAGYL CAPS 500MG/CAP BTX30"), for the medicines table. */
  fullNames: Map<string, string>;
  strengths: Map<string, string | null>;
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

  // Every medicine being taken or paused, plus any other with doses in the period.
  const medicines = input.medications
    .filter((med) => med.treatmentState === "active" || med.treatmentState === "paused" || dosed.has(med.id))
    .sort((a, b) => byName.compare(nameOf(a.id), nameOf(b.id)))
    .map((med): DoctorReportMedicine => {
      const recorded = input.transactions.some((t) => t.userMedicationId === med.id);
      // Below zero only when more was taken than was ever entered: none left.
      const stock = recorded ? computeCurrentStock(input.transactions, med.id) : null;
      const shownStock = stock !== null && Number(stock) < 0 ? "0" : stock;
      return {
        name: input.fullNames.get(med.id) ?? nameOf(med.id),
        strength: input.strengths.get(med.id) ?? null,
        form: dosageFormLabel(med.customForm ?? med.inventoryUnit),
        treatment: TREATMENT_STATE_LABELS[med.treatmentState],
        stock: shownStock === null ? null : (doseQuantityLabel(shownStock, med.inventoryUnit) ?? shownStock),
      };
    });

  return { personName: input.personName, range, createdAt: now, medicines, doses };
}
