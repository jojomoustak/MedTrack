import { describe, expect, it } from "vitest";
import { validateMedicationPhotoUpload } from "@/lib/validation/medication-photo";
import { ValidationError } from "@/lib/errors/app-error";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP_BYTES = new Uint8Array([
  ...new TextEncoder().encode("RIFF"),
  0x00,
  0x00,
  0x00,
  0x00,
  ...new TextEncoder().encode("WEBP"),
]);
const NOT_AN_IMAGE = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

describe("validateMedicationPhotoUpload", () => {
  it("accepts a real JPEG", () => {
    expect(validateMedicationPhotoUpload({ contentType: "image/jpeg", size: JPEG_BYTES.length, bytes: JPEG_BYTES })).toBe("image/jpeg");
  });

  it("accepts a real PNG", () => {
    expect(validateMedicationPhotoUpload({ contentType: "image/png", size: PNG_BYTES.length, bytes: PNG_BYTES })).toBe("image/png");
  });

  it("accepts a real WEBP", () => {
    expect(validateMedicationPhotoUpload({ contentType: "image/webp", size: WEBP_BYTES.length, bytes: WEBP_BYTES })).toBe("image/webp");
  });

  it("rejects an empty file", () => {
    expect(() => validateMedicationPhotoUpload({ contentType: "image/jpeg", size: 0, bytes: new Uint8Array() })).toThrow(ValidationError);
  });

  it("rejects a file over the 8MB limit", () => {
    expect(() =>
      validateMedicationPhotoUpload({ contentType: "image/jpeg", size: 8 * 1024 * 1024 + 1, bytes: JPEG_BYTES }),
    ).toThrow(/8MB/);
  });

  it("rejects a disallowed declared content-type (e.g. a PDF)", () => {
    expect(() =>
      validateMedicationPhotoUpload({ contentType: "application/pdf", size: NOT_AN_IMAGE.length, bytes: NOT_AN_IMAGE }),
    ).toThrow(/Μη υποστηριζόμενος τύπος/);
  });

  it("rejects a file whose declared content-type is an allowed image type but whose bytes are NOT actually that format (spoofed Content-Type)", () => {
    expect(() =>
      validateMedicationPhotoUpload({ contentType: "image/jpeg", size: NOT_AN_IMAGE.length, bytes: NOT_AN_IMAGE }),
    ).toThrow(/δεν φαίνεται να είναι έγκυρη εικόνα/);
  });

  it("rejects a truncated file that's too short to contain the full magic-byte signature", () => {
    const tooShort = new Uint8Array([0x89, 0x50]);
    expect(() => validateMedicationPhotoUpload({ contentType: "image/png", size: tooShort.length, bytes: tooShort })).toThrow(ValidationError);
  });
});
