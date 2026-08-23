/**
 * Validation for user-uploaded medication package photos
 * (`POST /api/medications/[id]/photo`, `lib/medications/server/photo.ts`).
 * Pure/DB-free and framework-free on purpose — shared by the server route
 * (real enforcement) and the client upload component (fast, friendly
 * feedback before a network round trip; never the ONLY line of defense,
 * CLAUDE.md rule 7).
 *
 * A declared `Content-Type` is trivially spoofable by any client, so this
 * also sniffs the real magic bytes of the file and requires them to match
 * one of the allowed formats — a mismatched/absent signature is rejected
 * even if the declared type looked fine.
 */
import { ValidationError } from "@/lib/errors/app-error";

/** 8MB — generous for a phone camera photo of a medication package, small enough to keep upload/storage costs bounded. */
export const MAX_MEDICATION_PHOTO_BYTES = 8 * 1024 * 1024;

export const ALLOWED_MEDICATION_PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMedicationPhotoContentType = (typeof ALLOWED_MEDICATION_PHOTO_CONTENT_TYPES)[number];

function isAllowedContentType(value: string): value is AllowedMedicationPhotoContentType {
  return (ALLOWED_MEDICATION_PHOTO_CONTENT_TYPES as readonly string[]).includes(value);
}

/** Real magic-byte signatures for each allowed format — matched against the START of the file, independent of the declared `Content-Type`. */
const MAGIC_BYTE_CHECKS: Record<AllowedMedicationPhotoContentType, (buf: Uint8Array) => boolean> = {
  "image/jpeg": (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  "image/png": (buf) =>
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a,
  "image/webp": (buf) => {
    if (buf.length < 12) return false;
    const riff = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
    const webp = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
    return riff === "RIFF" && webp === "WEBP";
  },
};

export interface MedicationPhotoUploadCandidate {
  /** As declared by the client (`File.type`) — never trusted alone, see module doc. */
  contentType: string;
  size: number;
  /** The file's actual bytes — at least the first 12 are enough for every check above, but callers typically have the whole buffer already. */
  bytes: Uint8Array;
}

/**
 * Throws a `ValidationError` (safe, plain-language, already user-facing
 * per the app's error-copy convention) if the candidate fails any check.
 * Returns the confirmed content type on success.
 */
export function validateMedicationPhotoUpload(candidate: MedicationPhotoUploadCandidate): AllowedMedicationPhotoContentType {
  if (!Number.isFinite(candidate.size) || candidate.size <= 0) {
    throw new ValidationError("Το αρχείο είναι κενό ή μη έγκυρο.");
  }
  if (candidate.size > MAX_MEDICATION_PHOTO_BYTES) {
    throw new ValidationError("Το αρχείο είναι πολύ μεγάλο. Το μέγιστο μέγεθος είναι 8MB.");
  }

  const declared = candidate.contentType.trim().toLowerCase();
  if (!isAllowedContentType(declared)) {
    throw new ValidationError("Μη υποστηριζόμενος τύπος αρχείου. Χρησιμοποιήστε φωτογραφία JPEG, PNG ή WEBP.");
  }

  if (!MAGIC_BYTE_CHECKS[declared](candidate.bytes)) {
    throw new ValidationError("Το αρχείο δεν φαίνεται να είναι έγκυρη εικόνα.");
  }

  return declared;
}
