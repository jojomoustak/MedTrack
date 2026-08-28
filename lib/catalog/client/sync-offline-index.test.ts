import { describe, expect, it, vi } from "vitest";
import { syncOfflineIndex } from "@/lib/catalog/client/sync-offline-index";
import type { OfflineIndexRepository } from "@/lib/domain/repositories";
import type { OfflineIndexEntry } from "@/lib/domain/offline-index";

function makeEntry(overrides: Partial<OfflineIndexEntry> = {}): OfflineIndexEntry {
  return {
    id: "product-1",
    eofCode: "023280202",
    gtin: null,
    gtins: [],
    barcode: "2800232802025",
    name: "DEPON EF.TAB 500MG/TAB",
    activeIngredient: "PARACETAMOL",
    strengthValue: null,
    strengthUnit: null,
    form: null,
    packSizeValue: null,
    packSizeUnit: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<OfflineIndexRepository> = {}): OfflineIndexRepository {
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

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe("syncOfflineIndex — manifest-first, checksum-validated, atomic (spec §16-18)", () => {
  it("offline: never calls fetch, returns skipped-offline", async () => {
    const fetchImpl = vi.fn();
    const outcome = await syncOfflineIndex("offline", { fetchImpl });
    expect(outcome).toEqual({ status: "skipped-offline" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("local manifest version matches remote: up-to-date, never downloads the full payload", async () => {
    const repository = makeRepo({ getManifest: vi.fn().mockResolvedValue({ version: "same-hash", recordCount: 1, generatedAt: "t", syncedAt: "t" }) });
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/manifest")) return Promise.resolve(jsonResponse({ version: "same-hash", recordCount: 1, generatedAt: "t" }));
      throw new Error("should never fetch the full index when up to date");
    });

    const outcome = await syncOfflineIndex("online", { repository, fetchImpl });

    expect(outcome).toEqual({ status: "up-to-date", version: "same-hash" });
    expect(repository.replaceAll).not.toHaveBeenCalled();
  });

  it("no local manifest (first sync ever): downloads, verifies, and installs", async () => {
    const entries = [makeEntry()];
    const repository = makeRepo();
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/manifest")) return Promise.resolve(jsonResponse({ version: "hash-v1", recordCount: 1, generatedAt: "gen-t" }));
      return Promise.resolve(jsonResponse({ manifest: { version: "hash-v1", recordCount: 1, generatedAt: "gen-t" }, entries }));
    });
    const computeSha256Hex = vi.fn().mockResolvedValue("hash-v1");

    const outcome = await syncOfflineIndex("online", { repository, fetchImpl, computeSha256Hex });

    expect(outcome).toEqual({ status: "updated", version: "hash-v1", recordCount: 1 });
    expect(repository.replaceAll).toHaveBeenCalledTimes(1);
    const [installedManifest, installedEntries] = (repository.replaceAll as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(installedManifest).toMatchObject({ version: "hash-v1", recordCount: 1, generatedAt: "gen-t" });
    expect(installedEntries).toEqual(entries);
  });

  it("record-count mismatch between manifest and payload: rejected, never installed", async () => {
    const repository = makeRepo();
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/manifest")) return Promise.resolve(jsonResponse({ version: "hash-v1", recordCount: 5, generatedAt: "t" }));
      return Promise.resolve(jsonResponse({ manifest: { version: "hash-v1", recordCount: 5, generatedAt: "t" }, entries: [makeEntry()] })); // only 1, not 5
    });

    const outcome = await syncOfflineIndex("online", { repository, fetchImpl });

    expect(outcome.status).toBe("failed");
    expect(repository.replaceAll).not.toHaveBeenCalled();
  });

  it("checksum mismatch (corrupted/tampered payload): rejected, never installed", async () => {
    const repository = makeRepo();
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/manifest")) return Promise.resolve(jsonResponse({ version: "hash-v1", recordCount: 1, generatedAt: "t" }));
      return Promise.resolve(jsonResponse({ manifest: { version: "hash-v1", recordCount: 1, generatedAt: "t" }, entries: [makeEntry()] }));
    });
    const computeSha256Hex = vi.fn().mockResolvedValue("a-completely-different-hash");

    const outcome = await syncOfflineIndex("online", { repository, fetchImpl, computeSha256Hex });

    expect(outcome).toEqual({ status: "failed", reason: expect.stringContaining("checksum mismatch") });
    expect(repository.replaceAll).not.toHaveBeenCalled();
  });

  it("network failure fetching the manifest: failed outcome, never throws, never installs", async () => {
    const repository = makeRepo();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    const outcome = await syncOfflineIndex("online", { repository, fetchImpl });

    expect(outcome.status).toBe("failed");
    expect(repository.replaceAll).not.toHaveBeenCalled();
  });

  it("local manifest exists but differs from remote: downloads and replaces", async () => {
    const repository = makeRepo({ getManifest: vi.fn().mockResolvedValue({ version: "old-hash", recordCount: 1, generatedAt: "t0", syncedAt: "t0" }) });
    const entries = [makeEntry()];
    const fetchImpl = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/manifest")) return Promise.resolve(jsonResponse({ version: "new-hash", recordCount: 1, generatedAt: "t1" }));
      return Promise.resolve(jsonResponse({ manifest: { version: "new-hash", recordCount: 1, generatedAt: "t1" }, entries }));
    });
    const computeSha256Hex = vi.fn().mockResolvedValue("new-hash");

    const outcome = await syncOfflineIndex("online", { repository, fetchImpl, computeSha256Hex });

    expect(outcome).toEqual({ status: "updated", version: "new-hash", recordCount: 1 });
  });
});
