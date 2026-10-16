"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client/auth-client";
import { useFirstName } from "@/lib/auth/client/use-first-name";
import { useProfileId } from "@/components/shell/CurrentProfileContext";
import { Button } from "@/components/ui/Button";
import { SegmentedControl, type Segment } from "@/components/ui/SegmentedControl";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";
import { reportRange, toLocalDateInput, type ReportPeriod } from "@/lib/reports/doctor-report";
import { loadDoctorReport } from "@/lib/reports/client/load-doctor-report";
import { loadReportFonts, periodLabel, renderDoctorReportPdf, reportFileName } from "@/lib/reports/client/render-doctor-report-pdf";
import { saveFile } from "@/lib/platform/save-file";
import { playSound } from "@/lib/sound/client/play-sound";
import { logger } from "@/lib/logging/logger";

const PERIODS: Segment<ReportPeriod>[] = [
  { value: "30d", label: "30 ημέρες" },
  { value: "3m", label: "3 μήνες" },
  { value: "6m", label: "6 μήνες" },
  { value: "custom", label: "Άλλο διάστημα" },
];

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * «Αναφορά για τον γιατρό» (owner's request, 2026-10-16): a PDF with a
 * summary of the doses, the medicines with their schedule and stock today,
 * and every dose of a chosen period, to show or send to a doctor. Made on the phone from what's on it, so it works
 * offline and includes changes not sent yet (`lib/reports/`).
 */
export function DoctorReportForm() {
  const profileId = useProfileId();
  const { data: session } = authClient.useSession();
  const firstName = useFirstName();
  const [period, setPeriod] = useState<ReportPeriod>("30d");
  const [customFrom, setCustomFrom] = useState(() => toLocalDateInput(daysAgo(29)));
  const [customTo, setCustomTo] = useState(() => toLocalDateInput(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const today = toLocalDateInput(new Date());
  const range = reportRange(period, new Date(), { from: customFrom, to: customTo });

  async function handleCreate() {
    playSound("button");
    setError(null);
    setSaved(false);
    if (!range.ok) {
      setError(range.error);
      return;
    }
    setBusy(true);
    try {
      const personName = session?.user?.name?.trim() || firstName;
      const [report, fonts] = await Promise.all([loadDoctorReport(profileId, range.range, personName), loadReportFonts()]);
      const pdf = await renderDoctorReportPdf(report, fonts);
      saveFile(pdf, reportFileName(report));
      playSound("success");
      setSaved(true);
    } catch (err) {
      logger.warn("doctor_report.failed", { message: err instanceof Error ? err.message : String(err) });
      setError("Η αναφορά δεν δημιουργήθηκε. Δοκιμάστε ξανά.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-5 pt-1 pb-6">
      <div>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900">Αναφορά για τον γιατρό</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-stone-700">
          Ένα PDF με σύνοψη των δόσεων, τα φάρμακά σας με το πρόγραμμα και το απόθεμά τους, και κάθε δόση της περιόδου που θα διαλέξετε, για να το δείξετε ή να το στείλετε στον γιατρό σας.
        </p>
      </div>

      <section className="surface-card flex flex-col gap-4 p-4" aria-labelledby="period-heading">
        <h2 id="period-heading" className="text-[17px] font-semibold text-stone-900">
          Περίοδος
        </h2>
        <SegmentedControl
          label="Περίοδος"
          segments={PERIODS}
          value={period}
          columns={2}
          onChange={(value) => {
            playSound("button");
            setPeriod(value);
            setError(null);
            setSaved(false);
          }}
        />

        {period === "custom" && (
          <div className="grid grid-cols-2 gap-3">
            <label className={FIELD_WRAPPER}>
              <span className={FIELD_LABEL}>Από</span>
              <input type="date" value={customFrom} max={today} onChange={(e) => setCustomFrom(e.target.value)} className={`${FIELD_INPUT} pr-3`} />
            </label>
            <label className={FIELD_WRAPPER}>
              <span className={FIELD_LABEL}>Έως</span>
              <input type="date" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} className={`${FIELD_INPUT} pr-3`} />
            </label>
          </div>
        )}

        <p className="text-[15px] text-stone-600" aria-live="polite">
          {range.ok ? periodLabel(range) : range.error}
        </p>
      </section>

      {error && (
        <p role="alert" className="text-[15px] font-medium text-red-700">
          {error}
        </p>
      )}

      <Button size="lg" fullWidth disabled={busy || !range.ok} aria-busy={busy} onClick={() => void handleCreate()}>
        {busy ? "Δημιουργία…" : "Δημιουργία PDF"}
      </Button>

      {saved && (
        <p role="status" className="text-center text-[15px] font-medium text-accent-800">
          Η αναφορά είναι έτοιμη.
        </p>
      )}

      <p className="text-[14px] leading-relaxed text-stone-500">
        Δημιουργείται στο κινητό σας από όσα έχετε καταγράψει, και χωρίς σύνδεση. Δεν είναι ιατρικό έγγραφο.
      </p>
    </main>
  );
}
