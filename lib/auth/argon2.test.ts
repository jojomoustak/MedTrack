import { describe, expect, it } from "vitest";
import { ARGON2_PARAMS, Argon2FormatError, hashPassword, verifyPassword } from "@/lib/auth/argon2";

// These exercise the real Node.js crypto.argon2/argon2Sync implementation
// (Node 24.7+) — not mocked — since that's the whole point of ADR-003's
// choice (avoid native-binary build failures on Vercel).
describe("Argon2id password hashing (ADR-003 params)", () => {
  it("hashes at the ADR-003-mandated parameters (m=65536 KiB, t=3, p=1)", async () => {
    const result = await hashPassword("correct horse battery staple");
    expect(result.algorithm).toBe("argon2id");
    expect(result.params).toEqual({ m: ARGON2_PARAMS.memory, t: ARGON2_PARAMS.passes, p: ARGON2_PARAMS.parallelism });
    expect(result.encoded.startsWith("$argon2id$")).toBe(true);
  });

  it("round-trips: a correct password verifies against its own hash", async () => {
    const { encoded } = await hashPassword("a real user password");
    await expect(verifyPassword("a real user password", encoded)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const { encoded } = await hashPassword("the real password");
    await expect(verifyPassword("a completely different password", encoded)).resolves.toBe(false);
  });

  it("produces a different encoded hash each time (random salt) even for the same password", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a.encoded).not.toBe(b.encoded);
    // ...but both still verify correctly against their own hash.
    await expect(verifyPassword("same password", a.encoded)).resolves.toBe(true);
    await expect(verifyPassword("same password", b.encoded)).resolves.toBe(true);
  });

  it("never throws on a malformed stored hash — verification just fails closed", async () => {
    await expect(verifyPassword("anything", "not-a-real-hash")).resolves.toBe(false);
    await expect(verifyPassword("anything", "$argon2id$garbage$$$")).resolves.toBe(false);
  });

  it("rejects a hash claiming a different algorithm tag", async () => {
    const { encoded } = await hashPassword("password");
    const tampered = encoded.replace("$argon2id$", "$argon2i$");
    await expect(verifyPassword("password", tampered)).resolves.toBe(false);
  });

  it("Argon2FormatError is exported for callers that want to distinguish parse failures", () => {
    expect(Argon2FormatError).toBeDefined();
  });
});
