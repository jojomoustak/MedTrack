/**
 * The app-shell service worker (found missing 2026-08-28: a cold WebView
 * launch/reload while offline had nothing to fall back to, so Chromium
 * showed its own raw `net::ERR_INTERNET_DISCONNECTED` page — completely
 * independent of Median's own "offline page" setting, which only controls
 * whether MEDIAN wraps a failed navigation in its own branded screen, not
 * whether the app has anything to serve at all).
 *
 * Scope, deliberately narrow: this caches the STATIC APP SHELL only — the
 * JS/CSS bundles and the page-navigation HTML — never `/api/*` responses.
 * This app already has its own purpose-built offline data layer for real
 * medication/schedule/dose data (`lib/db-client/` — IndexedDB + the
 * durable outbox + sync, per CLAUDE.md rule 2); duplicating that data a
 * second time into the service worker's Cache Storage would mean a second,
 * less-controlled copy of health data sitting outside this app's own
 * profile-scoped session/RLS model, persisting independently of login
 * state — CLAUDE.md's priority order (Security -> Privacy) says no. See
 * `NetworkOnly` on `/api/` below — deliberate, not an oversight.
 *
 * Strategy: NetworkFirst for page navigations — always prefer a fresh
 * copy when online (this is a personal medication app; correctness beats a
 * few hundred ms of cache-first speed), falling back to the last
 * successfully cached response only when the network genuinely fails.
 * Content-hashed `/_next/static/` files are CacheFirst (they can never be
 * stale; see their rule below). A route only becomes available offline
 * AFTER it (or, for id-keyed screens, any one id of it — `SHARED_PAGES`)
 * has been opened at least once online — first-ever-cold-offline-launch on a
 * brand new install still can't render anything (nothing to fall back to,
 * and no service worker would even be registered yet either) — that's an
 * inherent limit of any offline-caching approach, not something this file
 * papers over.
 *
 * Data-clear resilience (explicitly considered, not just data — the user
 * asked): Android's "Clear Data" wipes Cache Storage, IndexedDB, and this
 * service worker's own registration together, in the same action. Nothing
 * special is needed here for that: on the next online launch, the browser
 * re-registers this worker from scratch and `NetworkFirst` naturally
 * repopulates the cache as routes are visited again — the same as a fresh
 * install. If data is cleared while OFFLINE, there is genuinely nothing to
 * serve (no cache, no network) — an unavoidable, inherent limit, not a bug.
 *
 * This SW file itself is content-agnostic about script format — the format
 * decision (classic vs. ESM) lives in `app/serwist/[path]/route.ts`'s
 * `esbuildOptions: { format: "iife" }` and must match
 * `app/layout.tsx`'s `<SerwistProvider options={{ type: "classic" }}>`
 * exactly. Found via live device debugging (2026-08-29, real Chrome
 * DevTools Protocol session against the actual Android WebView, not
 * guessed): this WebView does not support module-type service workers at
 * all — `@serwist/turbopack`'s default (`format: "esm"` + registering with
 * `type: "module"`) fails with "ServiceWorker script evaluation failed"
 * regardless of this file's actual content, confirmed by bisecting with a
 * byte-for-byte equivalent bundle built both ways. This was the real
 * reason the entire offline-app-shell feature never worked on Android from
 * the day it was added, despite every earlier fix in this file's own
 * history being independently correct.
 */
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_FALLBACK_URL = "/offline.html";
const APP_SHELL_CACHE = "app-shell";

/**
 * REVERTED (2026-08-30): a same-shape-URL substitute-shell handler for
 * `/medications/[id]/photo` briefly lived here, meant to let a
 * never-individually-visited medication's photo page fall back to
 * ANOTHER medication's cached page instead of the generic
 * `/offline.html`. Wrong on a false premise: this route is NOT free of
 * server-embedded per-medication content — Next.js App Router bakes the
 * matched `[id]` route param into the server-rendered payload itself, so
 * serving one medication's cached document for a different medication's
 * URL doesn't just show a generic "loading shell" that self-corrects
 * client-side, it makes the app hydrate BELIEVING it's still showing the
 * ORIGINAL medication — confirmed live: a user reported seeing another
 * medication's actual photo (Flagyl's) displayed under a different
 * medication's URL. For a medication-tracking app that's a real safety
 * problem, not a cosmetic one, so this was reverted outright rather than
 * patched — the honest `/offline.html` "connect once to load this page"
 * fallback below is what a never-individually-visited detail route gets
 * offline, same as any other route in this file.
 *
 * Superseded (2026-10-08) by `SHARED_PAGES` below, on a premise that now
 * holds: id-keyed screens no longer have an `[id]` route param at all —
 * each is one static page that reads its id from the visible address on
 * the client (`usePathId`), so the cached document carries no
 * per-medication content to leak. Verified offline: a never-visited
 * medication's address renders THAT medication.
 */

/**
 * Screens keyed by an id are one prebuilt page each, rewritten from the
 * visible address (`next.config.ts`, `usePathId`): `/medications/<id>`
 * is the same file for every id. Caching them under that shared page's
 * path means opening ANY medication (or list, or dose) once online makes
 * every one of them available offline — not just the ids visited.
 */
const SHARED_PAGES: [RegExp, string][] = [
  [/^\/medications\/(?!add$|item$)[^/]+\/(edit|photo|inventory\/correct|packages\/add)$/, "/medications/item/$1"],
  [/^\/medications\/(?!add$|item$)[^/]+$/, "/medications/item"],
  [/^\/lists\/(?!item$)[^/]+$/, "/lists/item"],
  [/^\/calendar\/dose\/(?!item$)[^/]+$/, "/calendar/dose/item"],
];

function sharedPageCacheKey(request: Request): Request | string {
  const url = new URL(request.url);
  for (const [pattern, shared] of SHARED_PAGES) {
    const match = url.pathname.match(pattern);
    if (match) {
      url.pathname = shared.replace("$1", match[1] ?? "");
      return url.href;
    }
  }
  return request;
}

const serwist = new Serwist({
  // Populated at request/build time by `createSerwistRoute`
  // (`app/serwist/[path]/route.ts`) — includes `/offline.html` via that
  // route's own `additionalPrecacheEntries`, which is what makes the
  // `fallbacks` entry below valid (`Serwist` requires a fallback URL to
  // already be precached, it does not fetch it on its own).
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Health-data-bearing endpoints: never cached (module doc above).
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    // Next.js's own content-hashed static build output — a file at a given
    // URL never changes (a new deploy ships new filenames), so it's served
    // from the phone's cache first. It used to be network-first, so every
    // launch and every first visit to a screen fetched code over the
    // network that was already on the device (2026-10-08). Old deploys'
    // files age out instead of piling up.
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "next-static-assets",
        plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 24 * 3600, purgeOnQuotaError: true })],
      }),
    },
    // Page navigations — the actual "app shell" this file exists for.
    // Deliberately NOT gated on `request.mode === "navigate"` (a real
    // bug, found 2026-08-28 by comparing against a sibling project's
    // service worker): `SerwistProvider`'s `cacheOnNavigation` (on by
    // default) proactively asks this worker to cache each route as the
    // user moves around the app client-side, via a plain `postMessage`
    // that `Serwist.handleCache` turns into `new Request(url)` — and a
    // manually-constructed `Request` can never have `mode: "navigate"`
    // (only a real, browser-initiated top-level navigation gets that).
    // With the old `mode === "navigate"` condition, every one of those
    // proactive per-route-visit caching attempts silently matched NO
    // route at all and cached nothing — meaning normal in-app navigation
    // (this is a Next.js App Router app; most navigation is a client-side
    // route change, not a full page reload) never populated this cache,
    // so a later cold offline relaunch had nothing to fall back to even
    // after using the app extensively while online. `/_next/static/` and
    // `/api/` are already claimed by the two more specific routes above
    // (Serwist checks routes in registration order), so this broader,
    // final same-origin-GET catch-all is safe.
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/serwist/"),
      handler: new NetworkFirst({
        cacheName: APP_SHELL_CACHE,
        // How long a launch on a weak signal waits for the network before
        // using the saved copy (was 4 s; 2026-10-09). Network-first stays,
        // so a new deploy arrives with the next launch as one consistent
        // version — never old screens mixed with a new server.
        networkTimeoutSeconds: 2,
        plugins: [{ cacheKeyWillBeUsed: async ({ request }) => sharedPageCacheKey(request) }],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_FALLBACK_URL,
        // Neither the network nor the per-route cache had anything (a
        // route never opened online before, now requested offline) — this
        // is what serves the static offline page instead of letting the
        // request fail with nothing, which is what let Chromium's raw
        // error page through before.
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
