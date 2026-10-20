// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ScanStep } from "@/components/medications/ScanStep";
import { MobilePlatformUnavailableError, type MobilePlatform, type ScanResult } from "@/lib/platform/mobile-platform";
import type { CatalogCacheRepository, LearnedMappingRepository, OfflineIndexRepository, UnresolvedScanRepository } from "@/lib/domain/repositories";
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
    recognizePackageText: vi.fn(),
    requestReminderPermission: vi.fn(),
    upsertReminder: vi.fn(),
    cancelRemindersForDoseEvent: vi.fn(),
    cancelAllReminders: vi.fn(),
    setAutofill: vi.fn(),
    signInWithGoogle: vi.fn(),
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
    getByEofCode: vi.fn().mockResolvedValue(null),
    cacheAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeOfflineIndex(overrides: Partial<OfflineIndexRepository> = {}): OfflineIndexRepository {
  return {
    getManifest: vi.fn().mockResolvedValue(null),
    getById: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue([]),
    getByEofCode: vi.fn().mockResolvedValue(null),
    getByGtin: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue([]),
    replaceAll: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeLearnedMappings(overrides: Partial<LearnedMappingRepository> = {}): LearnedMappingRepository {
  return {
    getByGtin: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue({ overwroteDifferentProduct: false }),
    listUnsynced: vi.fn().mockResolvedValue([]),
    markSynced: vi.fn().mockResolvedValue(undefined),
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
    eofCode: null,
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
        cacheRepository={cache} offlineIndex={fakeOfflineIndex()}
        onConfirmCandidate={onConfirmCandidate}
        onFallbackToManual={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    // Scoped to the CandidateConfirmation heading/dev-diagnostics-panel
    // both legitimately show this data (spec §8's diagnostics panel
    // intentionally duplicates batch/expiry/product-name for real-device
    // debugging) — `getByRole("heading", ...)` and `getAllByText` (rather
    // than the single-match `getByText`) target the real UI without
    // assuming there's only one matching element on the page.
    expect(await screen.findByRole("heading", { name: product.name })).toBeTruthy();
    expect(screen.getAllByText("LOT9").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-12-31").length).toBeGreaterThan(0);

    screen.getByRole("button", { name: /επιβεβαίωση/i }).click();
    expect(onConfirmCandidate).toHaveBeenCalledTimes(1);
    const [confirmedProduct, parsed] = onConfirmCandidate.mock.calls[0];
    expect(confirmedProduct).toEqual(product);
    expect(parsed.batch).toBe("LOT9");
  });

  it("'ok' + a Greek national EAN-13 barcode (Path A, medication-resolution-architecture.md §2.5): resolves by EOF code, not GTIN, and shows candidate confirmation", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const product = makeProduct({ gtin: null, eofCode: "023280202", name: "DEPON αναβράζον 500mg" });
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "2800232802025", format: "EAN_13" }),
    });
    const getByGtin = vi.fn().mockResolvedValue(null);
    const getByEofCode = vi.fn().mockResolvedValue(product);
    const cache = fakeCache({ getByGtin, getByEofCode });
    const onConfirmCandidate = vi.fn();

    render(
      <ScanStep
        profileId="profile-1"
        platform={platform}
        cacheRepository={cache} offlineIndex={fakeOfflineIndex()}
        onConfirmCandidate={onConfirmCandidate}
        onFallbackToManual={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByRole("heading", { name: product.name })).toBeTruthy();
    // Resolved via the EOF-code cache lookup, never the GTIN one — a Greek
    // national barcode isn't a globally-resolvable GTIN (architecture doc §2.1).
    expect(getByEofCode).toHaveBeenCalledWith("023280202");
    expect(getByGtin).not.toHaveBeenCalled();

    screen.getByRole("button", { name: /επιβεβαίωση/i }).click();
    expect(onConfirmCandidate).toHaveBeenCalledTimes(1);
    expect(onConfirmCandidate.mock.calls[0][0]).toEqual(product);
  });
});

describe("ScanStep — catalog lookup outcomes", () => {
  it("cache miss + online + server VALID_IDENTIFIER_UNRESOLVED: shows the honest 'recognized, but no data yet' message (GTIN-resolution task spec §11) — not the generic 'couldn't identify' one, since a real GTIN WAS recognized", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "5201234567890", format: "EAN_13" }),
    });
    const cache = fakeCache();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ state: "VALID_IDENTIFIER_UNRESOLVED" }) }) as unknown as typeof fetch;

    render(
      <ScanStep
        profileId="profile-1"
        platform={platform}
        cacheRepository={cache}
        offlineIndex={fakeOfflineIndex()}
        learnedMappings={fakeLearnedMappings()}
        onConfirmCandidate={vi.fn()}
        onFallbackToManual={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByText(/αναγνωρίσαμε τον κωδικό του φαρμάκου/i)).toBeTruthy();
    expect(screen.queryByText(/δεν μπορέσαμε να αναγνωρίσουμε αυτόματα/i)).toBeNull();
  });

  it("cache miss + online + server CONFLICT: shows the honest 'multiple products claim this code' message — never silently picks one (GTIN-resolution task spec §19)", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "5201234567890", format: "EAN_13" }),
    });
    const cache = fakeCache();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ state: "CONFLICT", catalogProductIds: ["product-a", "product-b"] }) }) as unknown as typeof fetch;
    const onConfirmCandidate = vi.fn();

    render(
      <ScanStep
        profileId="profile-1"
        platform={platform}
        cacheRepository={cache}
        offlineIndex={fakeOfflineIndex()}
        onConfirmCandidate={onConfirmCandidate}
        onFallbackToManual={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByText(/περισσότερα από ένα προϊόντα/i)).toBeTruthy();
    expect(onConfirmCandidate).not.toHaveBeenCalled();
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
        cacheRepository={cache} offlineIndex={fakeOfflineIndex()}
        learnedMappings={fakeLearnedMappings()}
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

    render(<ScanStep profileId="profile-1" platform={platform} cacheRepository={cache} offlineIndex={fakeOfflineIndex()} onConfirmCandidate={vi.fn()} onFallbackToManual={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText(/δεν μπορέσαμε να αναγνωρίσουμε αυτόματα/i)).toBeTruthy();
    expect(cache.getByGtin).not.toHaveBeenCalled();
  });
});

describe("ScanStep — 'not found' screen", () => {
  // The EOF/EMA search links were removed at the owner's request (2026-10-20).
  it("online + not-found: no links to outside sites, just the ways to go on", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "5201234567890", format: "EAN_13" }),
    });
    const cache = fakeCache();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ state: "VALID_IDENTIFIER_UNRESOLVED" }) }) as unknown as typeof fetch;

    render(
      <ScanStep
        profileId="profile-1"
        platform={platform}
        cacheRepository={cache}
        offlineIndex={fakeOfflineIndex()}
        learnedMappings={fakeLearnedMappings()}
        onConfirmCandidate={vi.fn()}
        onFallbackToManual={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByRole("button", { name: "Συνέχεια με χειροκίνητη καταχώριση" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /ΕΟΦ/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /EMA/i })).toBeNull();
    expect(screen.queryByText(/Αναζήτηση σε επίσημες πηγές/)).toBeNull();
  });

  it("online + a well-formed Greek national EAN-13 with no catalog match: shows the 'recognized but not available' message, distinct from the generic one (spec §26)", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "2800232802025", format: "EAN_13" }),
    });
    const cache = fakeCache();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ product: null, gtin: null, eofCode: "023280202" }) }) as unknown as typeof fetch;

    render(<ScanStep profileId="profile-1" platform={platform} cacheRepository={cache} offlineIndex={fakeOfflineIndex()} onConfirmCandidate={vi.fn()} onFallbackToManual={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText(/Αναγνωρίσαμε τον κωδικό του φαρμάκου/i)).toBeTruthy();
    // The barcode was understood, not an unrecognized-scheme case — this is
    // never worded as "couldn't identify" (that would misrepresent what
    // actually happened: the code decoded fine, MedTracking just has no
    // catalog data for it yet).
    expect(screen.queryByText(/Δεν μπορέσαμε να αναγνωρίσουμε αυτόματα/i)).toBeNull();
  });

  it("offline + not-found: does NOT show official-source links (there's no point sending someone offline to an external site)", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("offline"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "5201234567890", format: "EAN_13" }),
    });
    const cache = fakeCache();
    const unresolvedScanRepository = fakeUnresolvedScanRepository();

    render(
      <ScanStep
        profileId="profile-1"
        platform={platform}
        cacheRepository={cache} offlineIndex={fakeOfflineIndex()}
        learnedMappings={fakeLearnedMappings()}
        unresolvedScanRepository={unresolvedScanRepository}
        onConfirmCandidate={vi.fn()}
        onFallbackToManual={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByText(/εκτός σύνδεσης/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /ΕΟΦ/i })).toBeNull();
  });

  it("QR_CODE format: shows the honest 'that's a QR code, not a product barcode' message, never the generic couldn't-identify one, never looked up as a product", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "https://example.com/leaflet", format: "QR_CODE" }),
    });
    const cache = fakeCache();
    const fetchImpl = vi.fn();
    global.fetch = fetchImpl as unknown as typeof fetch;

    render(<ScanStep profileId="profile-1" platform={platform} cacheRepository={cache} offlineIndex={fakeOfflineIndex()} onConfirmCandidate={vi.fn()} onFallbackToManual={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText(/κωδικός QR, όχι barcode προϊόντος/i)).toBeTruthy();
    expect(screen.queryByText(/δεν μπορέσαμε να αναγνωρίσουμε αυτόματα/i)).toBeNull();
    // Never even attempts a lookup — a QR isn't a candidate resolution path at all.
    expect(cache.getByGtin).not.toHaveBeenCalled();
    expect(cache.getByEofCode).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("empty raw value (degenerate edge case): no official-source links shown, nothing to search with", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "", format: "UNKNOWN" }),
    });
    const cache = fakeCache();

    render(<ScanStep profileId="profile-1" platform={platform} cacheRepository={cache} offlineIndex={fakeOfflineIndex()} onConfirmCandidate={vi.fn()} onFallbackToManual={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText(/δεν μπορέσαμε να αναγνωρίσουμε αυτόματα/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /ΕΟΦ/i })).toBeNull();
  });

  it("CODE_128 with no GTIN: still no outside links, and manual entry is offered", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const platform = fakePlatform({
      scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "not-a-gtin", format: "CODE_128" }),
    });
    const cache = fakeCache();

    render(<ScanStep profileId="profile-1" platform={platform} cacheRepository={cache} offlineIndex={fakeOfflineIndex()} onConfirmCandidate={vi.fn()} onFallbackToManual={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Συνέχεια με χειροκίνητη καταχώριση" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /ΕΟΦ/i })).toBeNull();
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

describe("ScanStep — packages this person identified before (2026-10-15)", () => {
  // Owner-reported: ALGOFREN, scanned again, still wasn't recognised —
  // Greek national barcodes ("280…") were never learned nor checked.
  const ALGOFREN = {
    id: "algofren-600",
    eofCode: "207000000",
    gtin: null,
    gtins: [],
    barcode: null,
    name: "ALGOFREN F.C.TAB 600MG/TAB BTx20 (BLIST 2x10)",
    activeIngredient: "IBUPROFEN",
    strengthValue: "600",
    strengthUnit: "mg",
    form: "tablet",
    packSizeValue: "20",
    packSizeUnit: "tablet",
  };
  const greekScan = () => fakePlatform({ scanBarcode: vi.fn().mockResolvedValue({ status: "ok", rawValue: "2800232802025", format: "EAN_13" }) });

  it("a Greek national barcode the catalog doesn't list, learned before: found straight away, even offline", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("offline"));
    const learnedMappings = fakeLearnedMappings({
      getByGtin: vi.fn(async (gtin: string) =>
        gtin === "02800232802025" ? { gtin, catalogProductId: "algofren-600", evidenceType: "USER_CONFIRMED" as const, confirmedAt: "2026-10-14T18:00:00.000Z", syncedAt: null } : null,
      ),
    });
    const offlineIndex = fakeOfflineIndex({ getById: vi.fn(async (id: string) => (id === "algofren-600" ? ALGOFREN : null)) });

    render(
      <ScanStep
        profileId="profile-1"
        platform={greekScan()}
        cacheRepository={fakeCache()}
        offlineIndex={offlineIndex}
        learnedMappings={learnedMappings}
        unresolvedScanRepository={fakeUnresolvedScanRepository()}
        onConfirmCandidate={vi.fn()}
        onFallbackToManual={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByRole("heading", { name: /ALGOFREN F\.C\.TAB 600MG/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Επιβεβαίωση — είναι αυτό το φάρμακο/ })).toBeTruthy();
  });

  it("an unrecognised Greek national barcode offers 'find it in the catalog' (handing over the package) and label reading", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    global.fetch = vi.fn(async (url: string) =>
      String(url).includes("resolve-identifier")
        ? ({ ok: true, json: async () => ({ state: "VALID_IDENTIFIER_UNRESOLVED" }) } as Response)
        : ({ ok: true, json: async () => ({ product: null, gtin: null, eofCode: "023280202" }) } as Response),
    ) as unknown as typeof fetch;
    const onSearchInstead = vi.fn();

    render(
      <ScanStep
        profileId="profile-1"
        platform={greekScan()}
        cacheRepository={fakeCache()}
        offlineIndex={fakeOfflineIndex()}
        learnedMappings={fakeLearnedMappings()}
        onSearchInstead={onSearchInstead}
        onConfirmCandidate={vi.fn()}
        onFallbackToManual={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const findIt = await screen.findByRole("button", { name: "Βρείτε το στον κατάλογο" });
    expect(screen.getByRole("button", { name: /Δοκιμή αναγνώρισης από την ετικέτα/ })).toBeTruthy();
    findIt.click();
    expect(onSearchInstead).toHaveBeenCalledWith(expect.objectContaining({ gtin: "02800232802025" }));
  });

  it("identified by other people (shared suggestion): says so, and learns it for this person only once they confirm", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("online"));
    const product = makeProduct({ id: "algofren-600", gtin: null, name: "ALGOFREN F.C.TAB 600MG/TAB BTx20 (BLIST 2x10)" });
    global.fetch = vi.fn(async (url: string) =>
      String(url).includes("resolve-identifier")
        ? ({ ok: true, json: async () => ({ state: "SUGGESTED", product }) } as Response)
        : ({ ok: true, json: async () => ({ product: null, gtin: null, eofCode: "023280202" }) } as Response),
    ) as unknown as typeof fetch;
    const learnedMappings = fakeLearnedMappings();
    const onConfirmCandidate = vi.fn();

    render(
      <ScanStep
        profileId="profile-1"
        platform={greekScan()}
        cacheRepository={fakeCache()}
        offlineIndex={fakeOfflineIndex()}
        learnedMappings={learnedMappings}
        onConfirmCandidate={onConfirmCandidate}
        onFallbackToManual={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByRole("heading", { name: /ALGOFREN F\.C\.TAB 600MG/ })).toBeTruthy();
    expect(screen.getByText(/Πρόταση από άλλους χρήστες του MedTrack, όχι από επίσημη πηγή/)).toBeTruthy();
    expect(learnedMappings.save).not.toHaveBeenCalled();

    screen.getByRole("button", { name: /Επιβεβαίωση — είναι αυτό το φάρμακο/ }).click();

    expect(onConfirmCandidate).toHaveBeenCalledWith(product, expect.objectContaining({ gtin: "02800232802025" }));
    await waitFor(() =>
      expect(learnedMappings.save).toHaveBeenCalledWith(expect.objectContaining({ gtin: "02800232802025", catalogProductId: "algofren-600", evidenceType: "USER_CONFIRMED" })),
    );
  });

  it("a match from the catalog itself shows no 'other users' note", async () => {
    __setNetworkMonitorForTests(fakeNetworkMonitor("offline"));
    const learnedMappings = fakeLearnedMappings({
      getByGtin: vi.fn(async (gtin: string) =>
        gtin === "02800232802025" ? { gtin, catalogProductId: "algofren-600", evidenceType: "USER_CONFIRMED" as const, confirmedAt: "2026-10-14T18:00:00.000Z", syncedAt: null } : null,
      ),
    });
    const offlineIndex = fakeOfflineIndex({ getById: vi.fn(async (id: string) => (id === "algofren-600" ? ALGOFREN : null)) });

    render(
      <ScanStep
        profileId="profile-1"
        platform={greekScan()}
        cacheRepository={fakeCache()}
        offlineIndex={offlineIndex}
        learnedMappings={learnedMappings}
        unresolvedScanRepository={fakeUnresolvedScanRepository()}
        onConfirmCandidate={vi.fn()}
        onFallbackToManual={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(await screen.findByRole("heading", { name: /ALGOFREN F\.C\.TAB 600MG/ })).toBeTruthy();
    expect(screen.queryByText(/Πρόταση από άλλους χρήστες/)).toBeNull();
  });
});
