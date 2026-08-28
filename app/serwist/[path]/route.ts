/**
 * Serves the built service worker (`app/sw.ts`) at `/serwist/sw.js`
 * (`@serwist/turbopack`'s Route-Handler-based integration — the Turbopack-
 * compatible replacement for `@serwist/next`'s webpack-plugin approach,
 * see `next.config.ts`'s doc comment for why that one doesn't work here).
 * `createSerwistRoute` bundles `app/sw.ts` with esbuild and generates the
 * exact static params (file paths) it produces, so this route is served
 * statically like any other precomputed route.
 *
 * No `additionalPrecacheEntries` here, deliberately: `createSerwistRoute`
 * already auto-scans `public/` (including `offline.html`) and adds each
 * file to the precache manifest itself, revisioned by the file's own
 * content hash. An earlier version of this route ALSO added an explicit
 * `additionalPrecacheEntries: [{ url: "/offline.html", revision: <git SHA> }]`
 * entry, believing it was required for `app/sw.ts`'s `fallbacks` option to
 * work — it is not, `Serwist`'s `fallbacks` only needs the URL to be
 * precached by *some* entry, not a specific one. That redundant entry gave
 * `/offline.html` two manifest entries with two different revisions (the
 * auto-scanned content hash vs. the git SHA), which made every single
 * service-worker install throw `add-to-cache-list-conflicting-entries` at
 * script-evaluation time. Root-caused 2026-08-29 via live-device CDP
 * debugging: `navigator.serviceWorker.register()` only ever surfaced a
 * generic, content-free "ServiceWorker script evaluation failed" TypeError
 * (Chromium deliberately hides the real error from the registering page);
 * the actual exception was only visible by attaching CDP directly to the
 * service worker's own execution target while it was paused at startup.
 * This conflicting-precache-entries bug — not the module-vs-classic script
 * format difference below — was the real reason the offline app shell
 * never worked; the format fix was independently correct (this WebView
 * genuinely does not support module-type service workers) but insufficient
 * on its own, since this bug threw before the SW could ever finish
 * evaluating either way.
 */
import { createSerwistRoute } from "@serwist/turbopack";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
  // This package's default esbuild output format is "esm", registered
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
