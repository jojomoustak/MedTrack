import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  /* config options here */
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
