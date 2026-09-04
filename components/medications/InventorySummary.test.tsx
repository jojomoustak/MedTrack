// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { InventorySummary } from "@/components/medications/InventorySummary";
import type { RefillProjection } from "@/lib/domain/inventory-consumption";

afterEach(() => cleanup());

const NO_PROJECTION: RefillProjection = { currentStock: "0", basis: "none", dailyRate: null, daysRemaining: null, projectedOutOfStockDate: null };

describe("InventorySummary", () => {
  it("shows the current stock with a unit label", () => {
    render(
      <InventorySummary currentStock="28" quantityUnit="tablet" belowThreshold={false} runningLowSoon={false} projection={NO_PROJECTION} />,
    );
    expect(screen.getByText(/28/)).toBeInTheDocument();
    expect(screen.getByText(/Δισκίο/)).toBeInTheDocument();
  });

  it("shows no low-stock cue and no projection line when neither applies", () => {
    render(
      <InventorySummary currentStock="28" quantityUnit="tablet" belowThreshold={false} runningLowSoon={false} projection={NO_PROJECTION} />,
    );
    expect(screen.queryByText(/Χαμηλό απόθεμα/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Εκτίμηση εξάντλησης/)).not.toBeInTheDocument();
  });

  it("shows the low-stock cue when belowThreshold is true", () => {
    render(<InventorySummary currentStock="2" quantityUnit="tablet" belowThreshold={true} runningLowSoon={false} projection={NO_PROJECTION} />);
    expect(screen.getByText(/Χαμηλό απόθεμα/)).toBeInTheDocument();
  });

  it("shows the low-stock cue when runningLowSoon is true, even below the raw threshold", () => {
    render(<InventorySummary currentStock="20" quantityUnit="tablet" belowThreshold={false} runningLowSoon={true} projection={NO_PROJECTION} />);
    expect(screen.getByText(/Χαμηλό απόθεμα/)).toBeInTheDocument();
  });

  it("shows the projection with its basis-specific copy and the mandatory 'not medical advice' micro-label", () => {
    const projection: RefillProjection = {
      currentStock: "20",
      basis: "observed",
      dailyRate: 2,
      daysRemaining: 10,
      projectedOutOfStockDate: "2026-01-25",
    };
    render(<InventorySummary currentStock="20" quantityUnit="tablet" belowThreshold={false} runningLowSoon={false} projection={projection} />);
    expect(screen.getByText(/Εκτίμηση εξάντλησης/)).toBeInTheDocument();
    expect(screen.getByText(/10/)).toBeInTheDocument();
    expect(screen.getByText(/πρόσφατης χρήσης/)).toBeInTheDocument();
    expect(screen.getByText(/δεν αποτελεί ιατρική σύσταση/)).toBeInTheDocument();
  });

  it("shows the scheduled-basis copy when basis is 'scheduled'", () => {
    const projection: RefillProjection = {
      currentStock: "20",
      basis: "scheduled",
      dailyRate: 1,
      daysRemaining: 20,
      projectedOutOfStockDate: "2026-02-04",
    };
    render(<InventorySummary currentStock="20" quantityUnit="tablet" belowThreshold={false} runningLowSoon={false} projection={projection} />);
    expect(screen.getByText(/προγράμματός σας/)).toBeInTheDocument();
  });
});
