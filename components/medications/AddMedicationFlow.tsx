"use client";

import { useState } from "react";
import { EntryChooser, type EntryChoice } from "@/components/medications/EntryChooser";
import { SearchStep } from "@/components/medications/SearchStep";
import { ScanStep } from "@/components/medications/ScanStep";
import { ManualEntryForm, type ManualEntryValues } from "@/components/medications/ManualEntryForm";
import { DetailsStep, type DetailsStepValues } from "@/components/medications/DetailsStep";
import { ScheduleStep } from "@/components/medications/ScheduleStep";
import { ReviewStep } from "@/components/medications/ReviewStep";
import { newId } from "@/lib/domain/ids";
import type { CatalogProduct } from "@/lib/domain/catalog";
import type { ParsedBarcode } from "@/lib/domain/gs1";
import type { ScheduleDraft } from "@/lib/domain/schedule-draft";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import { DexieMedicationScheduleRepository } from "@/lib/db-client/medication-schedule-repository";
import { DexieDoseEventRepository } from "@/lib/db-client/dose-event-repository";
import { generateDoseEventsForSchedule } from "@/lib/scheduling/client/dose-event-generator";
import type {
  CatalogCacheRepository,
  DoseEventRepository,
  MedicationScheduleRepository,
  OfflineIndexRepository,
  UnresolvedScanRepository,
  UserMedicationRepository,
} from "@/lib/domain/repositories";
import type { MedicationForm, UserMedicationRecord } from "@/lib/domain/user-medication";
import { getDefaultMobilePlatform } from "@/lib/platform/get-mobile-platform";
import type { MobilePlatform } from "@/lib/platform/mobile-platform";

type FlowStep = "entry" | "scan" | "search" | "manual" | "details" | "schedule" | "review";

export interface AddMedicationFlowProps {
  profileId: string;
  onCreated?: (record: UserMedicationRecord) => void;
  /** Test/DI seam — defaults to a real Dexie-backed repository. Typed against the storage-agnostic interface (ADR-001), not the concrete Dexie class, so tests can inject a plain fake. */
  repository?: UserMedicationRepository;
  /** Test/DI seam for the scan path — defaults to `MedianMobilePlatform`. */
  platform?: MobilePlatform;
  cacheRepository?: CatalogCacheRepository;
  offlineIndex?: OfflineIndexRepository;
  unresolvedScanRepository?: UnresolvedScanRepository;
  /** Test/DI seam — defaults to a real Dexie-backed repository. */
  scheduleRepository?: MedicationScheduleRepository;
  /** Test/DI seam — defaults to a real Dexie-backed repository. Used only for schedule-generated dose-event materialization right after a schedule is created. */
  doseEventRepository?: DoseEventRepository;
}

/** No `Package`/inventory schema exists yet to hold GS1-parsed expiry/batch as structured fields (`lib/domain/ids.ts`'s reserved `MedicationPackageId` is for a future phase). Folded into the free-text `notes` field so a scan's data is preserved and visible rather than silently discarded — a deliberate stopgap, not a modeling decision, until that entity ships. */
function buildScanNotes(expiry: string | null, batch: string | null): string | null {
  const parts: string[] = [];
  if (batch) parts.push(`Παρτίδα: ${batch}`);
  if (expiry) parts.push(`Λήξη: ${expiry}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Orchestrates Phase 3 §3 Journeys 1 and 3's Add Medication flow: entry
 * chooser → scan-or-search-or-manual → candidate confirmation (scan/search
 * paths) → details step → review & finish.
 *
 * Creates the `UserMedication` row through the Phase 5 outbox pattern
 * (`DexieUserMedicationRepository.create`) — the write is local-first and
 * instant (Phase 3 §4: "instant local write... no blocking, no spinner
 * on the primary action" for offline-capable mutations); the brief
 * `submitting` state below reflects the local Dexie transaction only, not
 * a network round trip.
 */
export function AddMedicationFlow({
  profileId,
  onCreated,
  repository,
  platform,
  cacheRepository,
  offlineIndex,
  unresolvedScanRepository,
  scheduleRepository,
  doseEventRepository,
}: AddMedicationFlowProps) {
  const [step, setStep] = useState<FlowStep>("entry");
  const [catalogProduct, setCatalogProduct] = useState<CatalogProduct | null>(null);
  const [manualName, setManualName] = useState<string | null>(null);
  const [details, setDetails] = useState<DetailsStepValues | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleDraft | null>(null);
  /** Which step "Πίσω" from the schedule step's kind chooser returns to — "review" only once Review has actually been reached at least once (editing an already-set schedule), "details" otherwise. */
  const [scheduleStepBackTarget, setScheduleStepBackTarget] = useState<"details" | "review">("details");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanAvailable] = useState(() => (platform ?? getDefaultMobilePlatform()).isAvailable());
  const [manualPrefill, setManualPrefill] = useState<{ expiry: string | null; batch: string | null }>({ expiry: null, batch: null });

  /** Manual entry NOT reached via a scan fallback (entry chooser directly, or search's "no results") — always a clean form, no stale pre-fill from an earlier scan attempt in the same flow instance. */
  function handleManualEntryDirect() {
    setManualPrefill({ expiry: null, batch: null });
    setStep("manual");
  }

  function handleEntryChoice(choice: EntryChoice) {
    if (choice === "scan") setStep("scan");
    else if (choice === "search") setStep("search");
    else if (choice === "manual") handleManualEntryDirect();
  }

  /**
   * A confirmed catalog/OCR match already carries real form/strength data
   * (`CandidateConfirmation`'s whole point is showing exactly this before
   * the user taps confirm) — `DetailsStep` afterward would only ever
   * re-display the same values read-only-in-practice, for a single
   * "Συνέχεια" tap that doesn't change anything. Skips straight to Review;
   * `inventoryUnit` defaults to the catalog's own form, matching
   * `DetailsStep`'s own prior default for a catalog-sourced product exactly
   * (a manual override is only actually useful for manual entry, where
   * nothing is known yet — that path still goes through `DetailsStep`
   * below).
   */
  function handleCandidateConfirmed(product: CatalogProduct, parsed?: ParsedBarcode) {
    setCatalogProduct(product);
    setManualName(null);
    setNotes(parsed ? buildScanNotes(parsed.expiry, parsed.batch) : null);
    setDetails({
      form: (product.form as MedicationForm | null) ?? null,
      strengthValue: product.strengthValue ?? "",
      strengthUnit: product.strengthUnit ?? "",
      inventoryUnit: (product.form as MedicationForm | null) ?? "tablet",
    });
    setStep("schedule");
  }

  /** Scan → "couldn't identify automatically" → "Continue manually," pre-filled with whatever GS1 fields were parsed (Phase 3 Journey 3). */
  function handleScanFallbackToManual(parsed: ParsedBarcode | null) {
    setManualPrefill({ expiry: parsed?.expiry ?? null, batch: parsed?.batch ?? null });
    setStep("manual");
  }

  function handleManualSubmit(values: ManualEntryValues) {
    setManualName(values.name);
    setCatalogProduct(null);
    setNotes(buildScanNotes(values.expiry, values.batch));
    setStep("details");
  }

  function handleDetailsSubmit(values: DetailsStepValues) {
    setDetails(values);
    setStep("schedule");
  }

  function handleScheduleContinue(draft: ScheduleDraft | null) {
    setSchedule(draft);
    setScheduleStepBackTarget("review");
    setStep("review");
  }

  /**
   * `MedicationScheduleRecord.userMedicationId` is a required FK — the
   * schedule *form* is filled in before Review (matching Phase 3 §2.5's
   * screen order), but the schedule *write* (+ dose-event generation)
   * only happens here, right after the medication itself gets a real
   * `id`, as a second step in the same `handleFinish` (ux-accessibility-
   * designer design, 2026-08-30). Keeps "one Finish tap, no blocking
   * spinner" true while respecting the FK.
   */
  async function handleFinish() {
    if (!details) return;
    setSubmitting(true);
    setError(null);
    try {
      const repo = repository ?? new DexieUserMedicationRepository();
      const record = await repo.create({
        id: newId(),
        profileId,
        clientMutationId: newId(),
        catalogProductId: catalogProduct?.id ?? null,
        customName: catalogProduct ? null : manualName,
        customForm: details.form,
        customStrengthValue: details.strengthValue || null,
        customStrengthUnit: details.strengthUnit || null,
        inventoryUnit: details.inventoryUnit,
        lowStockThresholdValue: null,
        expiryWarningDays: 30,
        notes,
      });

      if (schedule) {
        const scheduleRepo = scheduleRepository ?? new DexieMedicationScheduleRepository();
        const createdSchedule = await scheduleRepo.create({
          id: newId(),
          profileId,
          userMedicationId: record.id,
          clientMutationId: newId(),
          scheduleKind: schedule.scheduleKind,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          timezone: schedule.timezone,
          doseQuantityValue: schedule.doseQuantityValue,
          doseQuantityUnit: schedule.doseQuantityUnit,
          timesOfDay: schedule.timesOfDay,
          weekdaysMask: schedule.weekdaysMask,
          intervalHours: schedule.intervalHours,
          anchorAt: schedule.anchorAt,
        });
        await generateDoseEventsForSchedule(createdSchedule, doseEventRepository ?? new DexieDoseEventRepository());
      }

      onCreated?.(record);
    } catch {
      setError("Κάτι πήγε στραβά. Δοκιμάστε ξανά.");
    } finally {
      setSubmitting(false);
    }
  }

  const displayName = catalogProduct?.name ?? manualName ?? "";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 p-4">
      {step === "entry" && <EntryChooser onChoose={handleEntryChoice} scanAvailable={scanAvailable} />}
      {step === "scan" && (
        <ScanStep
          profileId={profileId}
          platform={platform}
          cacheRepository={cacheRepository}
          offlineIndex={offlineIndex}
          unresolvedScanRepository={unresolvedScanRepository}
          onConfirmCandidate={handleCandidateConfirmed}
          onFallbackToManual={handleScanFallbackToManual}
          onCancel={() => setStep("entry")}
        />
      )}
      {step === "search" && (
        <SearchStep onConfirmCandidate={(product) => handleCandidateConfirmed(product)} onFallbackToManual={handleManualEntryDirect} />
      )}
      {step === "manual" && (
        <ManualEntryForm onSubmit={handleManualSubmit} initialExpiry={manualPrefill.expiry} initialBatch={manualPrefill.batch} />
      )}
      {step === "details" && <DetailsStep catalogProduct={catalogProduct} manualName={manualName} onSubmit={handleDetailsSubmit} />}
      {step === "schedule" && (
        <ScheduleStep onContinue={handleScheduleContinue} onBack={() => setStep(scheduleStepBackTarget)} initialDraft={schedule} />
      )}
      {step === "review" && details && (
        <ReviewStep
          name={displayName}
          form={details.form}
          strengthValue={details.strengthValue}
          strengthUnit={details.strengthUnit}
          inventoryUnit={details.inventoryUnit}
          schedule={schedule}
          onEditSchedule={() => setStep("schedule")}
          onFinish={handleFinish}
          submitting={submitting}
          error={error}
        />
      )}
    </div>
  );
}
