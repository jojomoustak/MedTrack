import { describe, expect, it, vi } from "vitest";
import { MedicationPhotoApiError, deleteMedicationPhoto, fetchMedicationPhoto, uploadMedicationPhoto } from "@/lib/medications/client/photo-api";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("uploadMedicationPhoto", () => {
  it("POSTs a multipart form with credentials included", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ uploaded: true }), { status: 200 }));
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });

    await uploadMedicationPhoto("med-1", file, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/medications/med-1/photo");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("throws a MedicationPhotoApiError with the server's own safe message on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400, { error: { message: "Το αρχείο είναι πολύ μεγάλο. Το μέγιστο μέγεθος είναι 8MB." } }));
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });

    await expect(uploadMedicationPhoto("med-1", file, fetchImpl)).rejects.toMatchObject({
      message: "Το αρχείο είναι πολύ μεγάλο. Το μέγιστο μέγεθος είναι 8MB.",
      status: 400,
    });
  });

  it("falls back to a generic message if the error body isn't the expected shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("not json", { status: 500 }));
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });

    await expect(uploadMedicationPhoto("med-1", file, fetchImpl)).rejects.toBeInstanceOf(MedicationPhotoApiError);
  });

  it("throws a distinct offline message when fetch itself rejects (no HTTP response at all)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });

    await expect(uploadMedicationPhoto("med-1", file, fetchImpl)).rejects.toMatchObject({
      message: expect.stringContaining("διαδίκτυο"),
      status: undefined,
    });
  });
});

describe("fetchMedicationPhoto", () => {
  it("returns null (not an error) for a 404 — no photo attached yet is a normal state", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    await expect(fetchMedicationPhoto("med-1", fetchImpl)).resolves.toBeNull();
  });

  it("returns the blob on success", async () => {
    const blob = new Blob(["bytes"], { type: "image/jpeg" });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(blob, { status: 200 }));
    const result = await fetchMedicationPhoto("med-1", fetchImpl);
    expect(result).not.toBeNull();
  });

  it("throws for a genuine error status other than 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(403, { error: { message: "You don't have access to that." } }));
    await expect(fetchMedicationPhoto("med-1", fetchImpl)).rejects.toBeInstanceOf(MedicationPhotoApiError);
  });

  it("throws a distinct offline message when fetch itself rejects, not the generic load-failure copy", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchMedicationPhoto("med-1", fetchImpl)).rejects.toMatchObject({
      message: expect.stringContaining("διαδίκτυο"),
    });
  });
});

describe("deleteMedicationPhoto", () => {
  it("DELETEs with credentials included", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    await deleteMedicationPhoto("med-1", fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/medications/med-1/photo");
    expect(init.method).toBe("DELETE");
    expect(init.credentials).toBe("include");
  });

  it("throws on failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    await expect(deleteMedicationPhoto("med-1", fetchImpl)).rejects.toBeInstanceOf(MedicationPhotoApiError);
  });
});
