"use client";

import { useState } from "react";
import { EntryChooser, type EntryChoice } from "@/components/medications/EntryChooser";
import { SearchStep } from "@/components/medications/SearchStep";
import { ManualEntryForm } from "@/components/medications/ManualEntryForm";
import { DetailsStep, type DetailsStepValues } from "@/components/medications/DetailsStep";
import { ReviewStep } from "@/components/medications/ReviewStep";
import { newId } from "@/lib/domain/ids";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { DexieUserMedicationRepository } from "@/lib/db-client/user-medication-repository";
import type { UserMedicationRepository } from "@/lib/domain/repositories";
import type { UserMedicationRecord } from "@/lib/domain/user-medication";

type FlowStep = "entry" | "search" | "manual" | "details" | "review";

export interface AddMedicationFlowProps {
  profileId: string;
  onCreated?: (record: UserMedicationRecord) => void;
  /** Test/DI seam — defaults to a real Dexie-backed repository. Typed against the storage-agnostic interface (ADR-001), not the concrete Dexie class, so tests can inject a plain fake. */
  repository?: UserMedicationRepository;
}

/**
 * Orchestrates Phase 3 §3 Journey 1's Add Medication flow: entry chooser
 * → search-or-manual → candidate confirmation (search path only) →
 * details step → review & finish. Scan is out of scope (Phase 7-8).
 *
 * Creates the `UserMedication` row through the Phase 5 outbox pattern
 * (`DexieUserMedicationRepository.create`) — the write is local-first and
 * instant (Phase 3 §4: "instant local write... no blocking, no spinner
 * on the primary action" for offline-capable mutations); the brief
 * `submitting` state below reflects the local Dexie transaction only, not
 * a network round trip.
 */
export function AddMedicationFlow({ profileId, onCreated, repository }: AddMedicationFlowProps) {
  const [step, setStep] = useState<FlowStep>("entry");
  const [catalogProduct, setCatalogProduct] = useState<CatalogProduct | null>(null);
  const [manualName, setManualName] = useState<string | null>(null);
  const [details, setDetails] = useState<DetailsStepValues | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleEntryChoice(choice: EntryChoice) {
    if (choice === "search") setStep("search");
    else if (choice === "manual") setStep("manual");
    // "scan" is inert — EntryChooser never calls back with it (disabled button).
  }

  function handleCandidateConfirmed(product: CatalogProduct) {
    setCatalogProduct(product);
    setManualName(null);
    setStep("details");
  }

  function handleManualSubmit(values: { name: string }) {
    setManualName(values.name);
    setCatalogProduct(null);
    setStep("details");
  }

  function handleDetailsSubmit(values: DetailsStepValues) {
    setDetails(values);
    setStep("review");
  }

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
        notes: null,
      });
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
      {step === "entry" && <EntryChooser onChoose={handleEntryChoice} />}
      {step === "search" && <SearchStep onConfirmCandidate={handleCandidateConfirmed} onFallbackToManual={() => setStep("manual")} />}
      {step === "manual" && <ManualEntryForm onSubmit={handleManualSubmit} />}
      {step === "details" && <DetailsStep catalogProduct={catalogProduct} manualName={manualName} onSubmit={handleDetailsSubmit} />}
      {step === "review" && details && (
        <ReviewStep
          name={displayName}
          form={details.form}
          strengthValue={details.strengthValue}
          strengthUnit={details.strengthUnit}
          inventoryUnit={details.inventoryUnit}
          onFinish={handleFinish}
          submitting={submitting}
          error={error}
        />
      )}
    </div>
  );
}
