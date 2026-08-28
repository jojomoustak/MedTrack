/**
 * Serves the built service worker (`app/sw.ts`) at `/serwist/sw.js`
 * (`@serwist/turbopack`'s Route-Handler-based integration — the Turbopack-
 * compatible replacement for `@serwist/next`'s webpack-plugin approach,
 * see `next.config.ts`'s doc comment for why that one doesn't work here).
 * `createSerwistRoute` bundles `app/sw.ts` with esbuild and generates the
 * exact static params (file paths) it produces, so this route is served
 * statically like any other precomputed route.
 *
 * `additionalPrecacheEntries` is what makes `public/offline.html` (the
 * offline-fallback page `app/sw.ts` references) actually precached at
 * service-worker-install time — `Serwist`'s `fallbacks` option requires
 * its target URL to already be in the precache list, it does not fetch
 * and cache it on its own. `revision` is keyed to the deployed commit
 * (Vercel sets `VERCEL_GIT_COMMIT_SHA`) so a new deploy always invalidates
 * the cached copy, even though the file's own content rarely changes.
 */
import { createSerwistRoute } from "@serwist/turbopack";

const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  additionalPrecacheEntries: [{ url: "/offline.html", revision }],
  useNativeEsbuild: true,
  // Real bug found and fixed via live device debugging (2026-08-29): this
  // package's default esbuild output format is "esm", registered
  // client-side with `type: "module"` (SerwistProvider's own default).
  // Android WebView (confirmed on a real device, Chromium 151) does not
  // support module-type service workers at all -- registration fails with
  // "ServiceWorker script evaluation failed" regardless of the script's
  // actual content, purely because of the type/format combination. Proven
  // by bisection: a byte-for-byte equivalent bundle, same content, same
  // minification, built as a classic script (esbuild format "iife")
  // registers and evaluates successfully; the exact same source built as
  // "esm" and registered with type:"module" reproduces the failure
  // 1:1, independent of Serwist/manifest/runtimeCaching content. Overriding
  // the format here; app/layout.tsx's <SerwistProvider> must register with
  // type:"classic" to match -- the two have to agree, or the SAME failure
  // returns (a classic-formatted script registered as type:"module", or
  // vice versa, both fail to evaluate correctly).
  esbuildOptions: { format: "iife", target: "es2020" },
});
