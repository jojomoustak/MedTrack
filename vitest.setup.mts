// Extends `expect` with DOM matchers (toHaveAttribute, toBeEmptyDOMElement,
// etc.) for the jsdom-environment component tests
// (components/sync/*.test.tsx) — harmless no-op import for node-environment
// tests that never touch the DOM.
import "@testing-library/jest-dom/vitest";

// Baseline env vars so any test that transitively imports a module using
// `getEnv()` doesn't fail just for lacking config — tests that actually
// exercise `lib/config/env.ts`'s validation behavior override/clear these
// per-test via `__resetEnvCacheForTests()`.
// NODE_ENV is already set to "test" by Vitest itself — @types/node marks
// it read-only, so it's deliberately not touched here.
process.env.DATABASE_URL ??= "postgres://user:password@localhost:5432/test";
process.env.DATABASE_URL_DIRECT ??= "postgres://user:password@localhost:5432/test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-characters-long";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.BETTER_AUTH_TRUSTED_ORIGINS ??= "http://localhost:3000";
process.env.IP_HASH_PEPPER ??= "test-pepper-at-least-32-characters-long";
