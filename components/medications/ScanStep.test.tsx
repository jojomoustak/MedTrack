// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ScanStep } from "@/components/medications/ScanStep";
import { MobilePlatformUnavailableError, type MobilePlatform, type ScanResult } from "@/lib/platform/mobile-platform";
import type { CatalogCacheRepository, UnresolvedScanRepository } from "@/lib/domain/repositories";
import type { CatalogProduct } from "@/lib/domain/catalog";
import { SEED_PLACEHOLDER_SOURCE } from "@/lib/domain/catalog";
import { __setNetworkMonitorForTests } from "@/lib/sync/client/use-network-status";
import type { NetworkMonitor, NetworkState } from "@/lib/sync/client/network";

afterEach(() => {
  cleanup();
  __setNetworkMonitorForTests(undefined);
});

function fakePlatform(overrides: Partial<MobilePlatform> = {}): MobilePlatform {
  return {
    isAvailable: () => true,
    scanBarcode: vi.fn().mockResolvedValue({ status: "cancelled" } satisfies ScanResult),
    ...overrides,
  };
}

function fakeNetworkMonitor(state: NetworkState): NetworkMonitor {
  return {
    getState: () => state,
    subscribe: () => () => {},
    checkNow: async () => state,
    start: () => {},
    stop: () => {},
  };
}

function fakeCache(overrides: Partial<CatalogCacheRepository> = {}): CatalogCacheRepository {
  return {
    get: vi.fn().mockResolvedValue(null),
    getByGtin: vi.fn().mockResolvedValue(null),
    cacheAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeUnresolvedScanRepository(overrides: Partial<UnresolvedScanRepository> = {}): UnresolvedScanRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    listPending: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeProduct(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "product-1",
    gtin: "05012345678900",
    name: "Παρακεταμόλη 500mg",
    nameNormalized: "παρακεταμολη 500mg",
    manufacturer: null,
    activeIngredient: "Παρακεταμόλη",
    strengthValue: "500",
    strengthUnit: "mg",
    form: "tablet",
    packSizeValue: "20",
    packSizeUnit: "tablet",
    regulatorySource: SEED_PLACEHOLDER_SOURCE,
    sourceVersion: "test",
    sourceLastUpdated: new Date().toISOString(),
    lifecycleState: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ScanStep — the four native bridge response shapes", () => {
  it("MobilePlatformUnavailableError (no native shell): shows the 'mobile app required' message, offers manual fallback", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({ isAvailable: () => false });
    const onFallbackToManual = vi.fn();

    render(
      <ScanStep
        profileId="profile-1"
        platform={platform}
        onConfirmCandidate={vi.fn()}
        onFallbackToManual={onFallbackToManual}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByText(/διατίθεται μόνο μέσα από την εφαρμογή/i)).toBeTruthy();
    screen.getByRole("button", { name: /χειροκίνητη/i }).click();
    expect(onFallbackToManual).toHaveBeenCalledWith(null);
  });

  it("'cancelled': returns quietly to the caller (onCancel), no error shown", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({ scanBarcode: vi.fn().mockResolvedValue({ status: "cancelled" }) });
    const onCancel = vi.fn();

    render(<ScanStep profileId="profile-1" platform={platform} onConfirmCandidate={vi.fn()} onFallbackToManual={vi.fn()} onCancel={onCancel} />);

    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("'error' (native-reported): shows a plain-language message, never the raw errorCode", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "error", errorCode: "CAMERA_PERMISSION_DENIED", message: "denied" }),
    });

    render(<ScanStep profileId="profile-1" platform={platform} onConfirmCandidate={vi.fn()} onFallbackToManual={vi.fn()} onCancel={vi.fn()} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/CAMERA_PERMISSION_DENIED/);
    expect(alert.textContent).toMatch(/δεν ήταν δυνατή/i);
  });

  it("'ok' + cache hit: parses the barcode and shows candidate confirmation with the parsed GS1 fields carried through", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const product = makeProduct();
    const raw = `01${product.gtin}17${"261231"}10${"LOT9"}`;
    const platform = fakePlatform({ scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: raw, format: "GS1_DATA_MATRIX" }) });
    const cache = fakeCache({ getByGtin: vi.fn().mockResolvedValue(product) });
    const onConfirmCandidate = vi.fn();

    render(
      <ScanStep
        profileId="profile-1"
        platform={platform}
        cacheRepository={cache}
        onConfirmCandidate={onConfirmCandidate}
        onFallbackToManual={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByText(product.name)).toBeTruthy();
    expect(screen.getByText("LOT9")).toBeTruthy();
    expect(screen.getByText("2026-12-31")).toBeTruthy();

    screen.getByRole("button", { name: /επιβεβαίωση/i }).click();
    expect(onConfirmCandidate).toHaveBeenCalledTimes(1);
    const [confirmedProduct, parsed] = onConfirmCandidate.mock.calls[0];
    expect(confirmedProduct).toEqual(product);
    expect(parsed.batch).toBe("LOT9");
  });
});

describe("ScanStep — catalog lookup outcomes", () => {
  it("cache miss + online + server not-found: shows the 'couldn't identify automatically' screen", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "5201234567890", format: "EAN_13" }),
    });
    const cache = fakeCache();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ product: null, gtin: "05201234567890" }) }) as unknown as typeof fetch;

    render(<ScanStep profileId="profile-1" platform={platform} cacheRepository={cache} onConfirmCandidate={vi.fn()} onFallbackToManual={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText(/δεν μπορέσαμε να αναγνωρίσουμε αυτόματα/i)).toBeTruthy();
  });

  it("offline + cache miss: saves the unresolved scan, tells the user, and still allows continuing manually immediately", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("offline"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "5201234567890", format: "EAN_13" }),
    });
    const cache = fakeCache();
    const unresolvedScanRepository = fakeUnresolvedScanRepository();
    const onFallbackToManual = vi.fn();

    render(
      <ScanStep
        profileId="profile-1"
        platform={platform}
        cacheRepository={cache}
        unresolvedScanRepository={unresolvedScanRepository}
        onConfirmCandidate={vi.fn()}
        onFallbackToManual={onFallbackToManual}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByText(/εκτός σύνδεσης/i)).toBeTruthy();
    await waitFor(() => expect(unresolvedScanRepository.save).toHaveBeenCalledTimes(1));
    expect(unresolvedScanRepository.save).toHaveBeenCalledWith(expect.objectContaining({ profileId: "profile-1", gtin: "05201234567890" }));

    screen.getByRole("button", { name: /χειροκίνητη/i }).click();
    expect(onFallbackToManual).toHaveBeenCalledTimes(1);
  });

  it("raw value with no identifiable GTIN (e.g. CODE_128): skips lookup entirely, goes straight to the manual fallback screen", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "not-a-gtin", format: "CODE_128" }),
    });
    const cache = fakeCache();

    render(<ScanStep profileId="profile-1" platform={platform} cacheRepository={cache} onConfirmCandidate={vi.fn()} onFallbackToManual={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText(/δεν μπορέσαμε να αναγνωρίσουμε αυτόματα/i)).toBeTruthy();
    expect(cache.getByGtin).not.toHaveBeenCalled();
  });
});

describe("ScanStep — a rejected scanBarcode() promise that isn't MobilePlatformUnavailableError", () => {
  it("shows a generic retry-capable error, not the unavailable message", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({ scanBarcode: vi.fn().mockRejectedValue(new Error("boom")) });

    render(<ScanStep profileId="profile-1" platform={platform} onConfirmCandidate={vi.fn()} onFallbackToManual={vi.fn()} onCancel={vi.fn()} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/boom/i);
    expect(screen.getByRole("button", { name: /δοκιμάστε ξανά/i })).toBeTruthy();
  });

  it("a MobilePlatformUnavailableError thrown mid-call (not just at isAvailable()) still degrades to the unavailable screen", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({ scanBarcode: vi.fn().mockRejectedValue(new MobilePlatformUnavailableError()) });

    render(<ScanStep profileId="profile-1" platform={platform} onConfirmCandidate={vi.fn()} onFallbackToManual={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText(/διατίθεται μόνο μέσα από την εφαρμογή/i)).toBeTruthy();
  });
});
