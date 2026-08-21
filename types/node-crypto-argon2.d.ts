/**
 * Ambient type augmentation for Node.js's built-in Argon2 implementation
 * (`crypto.argon2` / `crypto.argon2Sync`), added in Node 24.7.0 as a
 * "Release candidate" stability API. `@types/node` (pinned to the ^20 line
 * for broader compatibility) does not yet ship types for it, so this
 * declares the exact documented signature by hand.
 *
 * Source of truth: https://nodejs.org/api/crypto.html#cryptoargon2algorithm-parameters-callback
 * (verified against the Node v24.18.1 docs — re-check this file if
 * upgrading past the "Release candidate" stability level changes the API.)
 *
 * ADR-003 requires this run in the Node.js runtime (not Edge) — see
 * `lib/auth/argon2.ts`.
 */
import "node:crypto";

declare module "node:crypto" {
  type Argon2Algorithm = "argon2d" | "argon2i" | "argon2id";
  type Argon2Input = string | ArrayBuffer | NodeJS.ArrayBufferView;

  interface Argon2Parameters {
    /** The password (or other secret material) being hashed. */
    message: Argon2Input;
    /** Salt — must be at least 8 bytes; 16+ random bytes recommended. */
    nonce: Argon2Input;
    /** Degree of parallelism (lanes). >= 1. */
    parallelism: number;
    /** Output key length in bytes. >= 4. */
    tagLength: number;
    /** Memory cost in KiB. >= 8 * parallelism. */
    memory: number;
    /** Number of iterations. >= 1. */
    passes: number;
    /** Optional pepper — must NOT be stored alongside the derived key. */
    secret?: Argon2Input;
    /** Optional non-secret additional data mixed into the hash. */
    associatedData?: Argon2Input;
  }

  function argon2(
    algorithm: Argon2Algorithm,
    parameters: Argon2Parameters,
    callback: (err: Error | null, derivedKey: Buffer) => void,
  ): void;

  function argon2Sync(algorithm: Argon2Algorithm, parameters: Argon2Parameters): Buffer;
}
