/**
 * Thin client for `/api/medications/[id]/photo` — same DI-seam shape as
 * `lib/sync/client/api.ts` (`fetchImpl: typeof fetch = fetch`, always
 * `credentials: "include"`). No IndexedDB/outbox involvement on purpose:
 * a photo isn't part of the offline sync model (`lib/medications/server/
 * photo.ts`'s header doc) — every call here is a direct, online-only
 * network request, and callers are expected to handle the offline/failed
 * case themselves (this module just throws a `MedicationPhotoApiError`
 * with a message that's already safe to show the user as-is).
 */
export class MedicationPhotoApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MedicationPhotoApiError";
  }
}

const OFFLINE_MESSAGE = "Δεν ήταν δυνατή η σύνδεση με το διαδίκτυο. Η φωτογραφία απαιτεί σύνδεση. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.";

async function readSafeErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * These calls never go through the offline outbox on purpose (this
 * module's header doc) -- every one is a live network request, so `fetch`
 * itself rejecting (as opposed to returning an HTTP error response)
 * always means "no connection", never a server-side failure. Found worth
 * distinguishing (2026-08-29 offline audit): without this, an offline
 * caller saw the generic "something went wrong, try again" copy --
 * misleading, since retrying in place can't help until the device is back
 * online. Mirrors the thrown-vs-returned distinction LoginForm already
 * makes for the same class of error.
 */
async function fetchOrThrowOffline(fetchImpl: typeof fetch, input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(input, init);
  } catch {
    throw new MedicationPhotoApiError(OFFLINE_MESSAGE);
  }
}

export async function uploadMedicationPhoto(userMedicationId: string, file: File | Blob, fetchImpl: typeof fetch = fetch): Promise<void> {
  const formData = new FormData();
  formData.set("photo", file);

  const response = await fetchOrThrowOffline(fetchImpl, `/api/medications/${userMedicationId}/photo`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const message = await readSafeErrorMessage(response, "Η μεταφόρτωση της φωτογραφίας απέτυχε. Δοκιμάστε ξανά.");
    throw new MedicationPhotoApiError(message, response.status);
  }
}

export interface MedicationPhotoBlob {
  blob: Blob;
}

/** Returns `null` when there's no photo attached yet (404) — a normal, expected state, not an error. */
export async function fetchMedicationPhoto(userMedicationId: string, fetchImpl: typeof fetch = fetch): Promise<MedicationPhotoBlob | null> {
  const response = await fetchOrThrowOffline(fetchImpl, `/api/medications/${userMedicationId}/photo`, {
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const message = await readSafeErrorMessage(response, "Δεν ήταν δυνατή η φόρτωση της φωτογραφίας.");
    throw new MedicationPhotoApiError(message, response.status);
  }

  return { blob: await response.blob() };
}

export async function deleteMedicationPhoto(userMedicationId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchOrThrowOffline(fetchImpl, `/api/medications/${userMedicationId}/photo`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const message = await readSafeErrorMessage(response, "Η αφαίρεση της φωτογραφίας απέτυχε. Δοκιμάστε ξανά.");
    throw new MedicationPhotoApiError(message, response.status);
  }
}
