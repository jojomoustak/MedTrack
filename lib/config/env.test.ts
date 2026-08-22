import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getEnv, __resetEnvCacheForTests } from "@/lib/config/env";
import { ConfigError } from "@/lib/errors/app-error";

const REQUIRED_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_DIRECT",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "BETTER_AUTH_TRUSTED_ORIGINS",
  "IP_HASH_PEPPER",
  // ADR-003 addendum (2026-08-21), A.9 — Google Sign-In.
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  // Account deletion (CLAUDE.md rule 9, Phase 2 §4).
  "ACCOUNT_ID_HASH_PEPPER",
] as const;

const VALID_ENV: Record<(typeof REQUIRED_KEYS)[number], string> = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  DATABASE_URL_DIRECT: "postgres://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "https://example.com",
  BETTER_AUTH_TRUSTED_ORIGINS: "https://example.com",
  IP_HASH_PEPPER: "b".repeat(32),
  GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  ACCOUNT_ID_HASH_PEPPER: "c".repeat(32),
};

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  savedEnv = { ...process.env };
  __resetEnvCacheForTests();
});

afterEach(() => {
  process.env = savedEnv;
  __resetEnvCacheForTests();
});

function setEnv(overrides: Partial<Record<(typeof REQUIRED_KEYS)[number], string | undefined>> = {}) {
  for (const key of REQUIRED_KEYS) {
    const value = key in overrides ? overrides[key] : VALID_ENV[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("getEnv", () => {
  it("returns validated config when everything required is present and well-formed", () => {
    setEnv();
    const env = getEnv();
    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(env.IP_HASH_PEPPER).toBe(VALID_ENV.IP_HASH_PEPPER);
  });

  it("caches the result — mutating process.env after the first call has no effect", () => {
    setEnv();
    const first = getEnv();
    process.env.DATABASE_URL = "postgres://changed/db";
    const second = getEnv();
    expect(second).toBe(first);
    expect(second.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
  });

  it("fails fast with a ConfigError (not a silent undefined) when a required var is missing", () => {
    setEnv({ DATABASE_URL: undefined });
    expect(() => getEnv()).toThrow(ConfigError);
  });

  it("never leaks the actual secret value in the thrown error message", () => {
    setEnv({ BETTER_AUTH_SECRET: "too-short" });
    try {
      getEnv();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).message).not.toContain("too-short");
    }
  });

  it("rejects a malformed DATABASE_URL that isn't a postgres connection string", () => {
    setEnv({ DATABASE_URL: "mysql://user:pass@localhost/db" });
    expect(() => getEnv()).toThrow(ConfigError);
  });

  it("rejects an invalid BETTER_AUTH_URL", () => {
    setEnv({ BETTER_AUTH_URL: "not-a-url" });
    expect(() => getEnv()).toThrow(ConfigError);
  });

  it("rejects a too-short IP_HASH_PEPPER (must be a real HMAC secret, not a placeholder)", () => {
    setEnv({ IP_HASH_PEPPER: "short" });
    expect(() => getEnv()).toThrow(ConfigError);
  });
});
