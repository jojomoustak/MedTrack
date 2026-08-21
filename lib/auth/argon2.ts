/**
 * Argon2id password hashing per ADR-003: `m=65536 KiB (64 MB), t=3, p=1`
 * (OWASP's stronger 2024–2026 recommended profile), using Node.js's
 * built-in `crypto.argon2`/`crypto.argon2Sync` (Node 24.7+) rather than a
 * native-binary npm package, to avoid the native-build failures ADR-003
 * documents for Vercel serverless functions.
 *
 * MUST run in the Node.js Vercel Functions runtime, never Edge — Edge
 * Functions can't load this API. Any route file that (directly or
 * transitively, e.g. via Better Auth) calls into this module must declare
 * `export const runtime = "nodejs";`.
 *
 * Output format: a self-describing, PHC-inspired encoded string
 * (`$argon2id$m=65536,t=3,p=1$<base64 salt>$<base64 hash>`) stored in
 * `account_credential.password_hash`, with the structured params mirrored
 * into `account_credential.hash_params` (per ADR-003) so a future
 * strengthening of parameters can rehash-on-next-login rather than a bulk
 * migration.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { argon2 as nodeArgon2 } from "node:crypto";

export const ARGON2_PARAMS = {
  memory: 65536, // KiB = 64 MB
  passes: 3,
  parallelism: 1,
  tagLength: 32,
  saltLength: 16,
} as const;

const ALGORITHM_TAG = "argon2id";

export interface HashedPassword {
  /** The full self-describing encoded string, ready for `account_credential.password_hash`. */
  encoded: string;
  algorithm: "argon2id";
  params: { m: number; t: number; p: number };
}

function argon2Async(parameters: {
  message: string;
  nonce: Buffer;
  memory: number;
  passes: number;
  parallelism: number;
  tagLength: number;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeArgon2(ALGORITHM_TAG, parameters, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Hashes a plaintext password. Never call with an already-hashed value. */
export async function hashPassword(plaintext: string): Promise<HashedPassword> {
  const salt = randomBytes(ARGON2_PARAMS.saltLength);
  const derived = await argon2Async({
    message: plaintext,
    nonce: salt,
    memory: ARGON2_PARAMS.memory,
    passes: ARGON2_PARAMS.passes,
    parallelism: ARGON2_PARAMS.parallelism,
    tagLength: ARGON2_PARAMS.tagLength,
  });

  const encoded = [
    "",
    ALGORITHM_TAG,
    `m=${ARGON2_PARAMS.memory},t=${ARGON2_PARAMS.passes},p=${ARGON2_PARAMS.parallelism}`,
    base64url(salt),
    base64url(derived),
  ].join("$");

  return {
    encoded,
    algorithm: "argon2id",
    params: { m: ARGON2_PARAMS.memory, t: ARGON2_PARAMS.passes, p: ARGON2_PARAMS.parallelism },
  };
}

interface ParsedHash {
  algorithm: string;
  memory: number;
  passes: number;
  parallelism: number;
  salt: Buffer;
  hash: Buffer;
}

export class Argon2FormatError extends Error {}

function parseEncoded(encoded: string): ParsedHash {
  const parts = encoded.split("$");
  // parts[0] is "" because encoded starts with "$"
  if (parts.length !== 5 || parts[0] !== "") {
    throw new Argon2FormatError("Malformed encoded Argon2 hash.");
  }
  const [, algorithm, paramsPart, saltPart, hashPart] = parts;
  const paramsMatch = /^m=(\d+),t=(\d+),p=(\d+)$/.exec(paramsPart);
  if (!paramsMatch) {
    throw new Argon2FormatError("Malformed Argon2 parameter segment.");
  }
  const [, m, t, p] = paramsMatch;
  return {
    algorithm,
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
    salt: Buffer.from(saltPart, "base64url"),
    hash: Buffer.from(hashPart, "base64url"),
  };
}

/**
 * Verifies a plaintext password against a stored encoded hash.
 * Uses a constant-time comparison for the final byte match; timing
 * differences from Argon2 itself are inherent to the KDF and not
 * mitigated further here (matches standard practice for this class of
 * verification, which is deliberately expensive, not a hot path).
 */
export async function verifyPassword(plaintext: string, encoded: string): Promise<boolean> {
  let parsed: ParsedHash;
  try {
    parsed = parseEncoded(encoded);
  } catch {
    return false;
  }
  if (parsed.algorithm !== ALGORITHM_TAG) return false;

  const derived = await argon2Async({
    message: plaintext,
    nonce: parsed.salt,
    memory: parsed.memory,
    passes: parsed.passes,
    parallelism: parsed.parallelism,
    tagLength: parsed.hash.length,
  });

  if (derived.length !== parsed.hash.length) return false;
  return timingSafeEqual(derived, parsed.hash);
}
