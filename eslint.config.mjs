import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Redaction (Phase 1 risk R12) is enforced by code, not convention:
  // every log line must go through lib/logging/logger.ts, which is the
  // one sanctioned `console.*` call site (see its inline
  // eslint-disable). Standalone CLI scripts (migrations) are also
  // exempt — they never run in a request context, so there's no health
  // data to redact.
  {
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["lib/db/migrate.ts", "lib/db/seed.ts", "scripts/import/run-mysyfa-import.ts", "scripts/import/run-reimbursed-new-drugs-import.ts"],
    rules: {
      "no-console": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
