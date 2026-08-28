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
 * Strategy: NetworkFirst for both static assets and page navigations —
 * always prefer a fresh copy when online (this is a personal medication
 * app; correctness beats a few hundred ms of cache-first speed), falling
 * back to the last successfully cached response only when the network
 * genuinely fails. A route only becomes available offline AFTER it has
 * been opened at least once online — first-ever-cold-offline-launch on a
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
 */
import { NetworkFirst, NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_FALLBACK_URL = "/offline.html";

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
    // Next.js's own content-hashed static build output — safe to cache
    // aggressively; a new deploy always ships new filenames, so this can
    // never serve stale code.
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new NetworkFirst({ cacheName: "next-static-assets" }),
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
        cacheName: "app-shell",
        networkTimeoutSeconds: 4,
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
