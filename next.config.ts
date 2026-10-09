import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

// Security review (Phase 15 Hardening, 2026-09-15): no security headers
// existed anywhere in the app before this. `'unsafe-inline'` on script-src
// is a known, accepted gap, not an oversight — Next.js's App Router
// streaming/Suspense implementation injects small inline `<script>` tags to
// swap in streamed content, and avoiding that needs a per-request nonce
// threaded through `middleware.ts` (a bigger change deferred for later,
// since this CSP's main value today is blocking *remote* script/object
// injection from other origins, which doesn't depend on that). No Google
// script is ever loaded in the browser (Google sign-in runs only through
// the native Android bridge, confirmed by grep — see
// lib/auth/client/google-auth-errors.ts), so connect-src/frame-src need no
// Google exception.
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      // Google account photos (Profile avatar, for accounts linked to Google).
      "img-src 'self' blob: data: https://*.googleusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  experimental: {
    // Every screen is prebuilt and only changes with a deploy, so a screen
    // prefetched once stays usable for 30 minutes instead of the default 5
    // — the first tap after a short break no longer waits on the network
    // (2026-10-09). A new deploy still arrives with the next launch (the
    // app shell is fetched network-first, `app/sw.ts`); until then the
    // running version keeps using its own, consistent set of screens.
    staleTimes: { static: 1800 },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Screens keyed by an id are each ONE prebuilt page: the visible address
  // keeps the id (`/medications/<id>`), the server serves the static page,
  // and the page reads the id from the address (`usePathId`). Every screen
  // is then static — no server function per tap (measured 2026-10-08:
  // ~0.4–1 s per tap on a phone), prefetchable, and available offline.
  // `afterFiles`: real routes such as `/medications/add` match first.
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        { source: "/medications/:id/edit", destination: "/medications/item/edit" },
        { source: "/medications/:id/inventory/correct", destination: "/medications/item/inventory/correct" },
        { source: "/medications/:id/packages/add", destination: "/medications/item/packages/add" },
        { source: "/medications/:id/photo", destination: "/medications/item/photo" },
        { source: "/medications/:id", destination: "/medications/item" },
        { source: "/lists/:id", destination: "/lists/item" },
        { source: "/calendar/dose/:id", destination: "/calendar/dose/item" },
      ],
      fallback: [],
    };
  },
};

// `@serwist/turbopack`, not `@serwist/next`: this project's `next build`
// defaults to Turbopack (confirmed by a real build attempt — @serwist/next's
// webpack-plugin-based InjectManifest hard-errors under Turbopack, since it
// injects a custom `webpack()` config Turbopack refuses to silently accept).
// This variant serves the service worker through a real Route Handler
// (`app/serwist/[path]/route.ts`) instead of emitting a static `public/sw.js`
// at webpack-build time, so it needs no bundler-specific config here at all —
// `withSerwist` only adds `esbuild`/`esbuild-wasm` to `serverExternalPackages`
// (the route handler bundles app/sw.ts with esbuild at request/build time).
export default withSerwist(nextConfig);
