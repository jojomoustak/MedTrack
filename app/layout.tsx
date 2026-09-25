import type { Metadata, Viewport } from "next";
import { Manrope, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SyncManagerBootstrap } from "@/components/shell/SyncManagerBootstrap";
import { SerwistProvider } from "@serwist/turbopack/react";

// Design pass (2026-09-26): was Inter — itself a fix for an earlier font
// (Geist Sans) that turned out to ship no Greek glyphs at all. Inter
// worked technically (real Greek coverage) but tested poorly on "feel" —
// direction-comparison mockups built to react to (not guessed at) pointed
// at Manrope specifically. Verified the same way Inter was: next/font's
// own bundled font-data.json lists `greek` in Manrope's subsets before
// ever wiring it in, not assumed from the name.
const sans = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "greek"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedTracking",
  description: "Παρακολούθηση φαρμάκων, δόσεων και αποθέματος — ακόμα και χωρίς σύνδεση.",
};

// UX feedback (2026-09-22): pinch-zoom on the app's own UI chrome (as
// opposed to zooming a photo or document) is a browser/website affordance
// this app never intended — Next's default viewport allows it since no
// `viewport` export existed before. Locked to `1` so the layout behaves
// like the native Android shell it's wrapped in (Median), not a
// pan-and-zoom webpage. Doesn't affect the OS-level text-size setting
// (Android's own "font size"/"display size" accessibility options, which
// this app's rem-based Tailwind type already respects) — only the
// separate browser pinch-to-zoom gesture.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="el"
      className={`${sans.variable} ${geistMono.variable} h-dvh antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        {/*
          Registers app/sw.ts (served at /serwist/sw.js — see
          app/serwist/[path]/route.ts) so the app shell is available on a
          cold offline relaunch. `reloadOnOnline={false}` overrides the
          library default: this app can be mid-way through a multi-step
          flow (Add Medication, OCR confirmation) when connectivity
          returns, and an unprompted full-page reload would silently
          discard whatever the user was doing — the existing
          SyncManager/useNetworkStatus reconnect handling already covers
          resuming sync without needing a hard reload.

          `options={{ type: "classic" }}` overrides SerwistProvider's own
          default of `type: "module"` — a real bug found via live device
          debugging (2026-08-29): Android WebView (confirmed on a real
          device) does not support module-type service workers at all,
          registration fails during script evaluation regardless of
          content. Must match app/serwist/[path]/route.ts's
          `esbuildOptions: { format: "iife" }` — a classic-formatted
          script registered as type:"module" (or the reverse) reproduces
          the exact same failure.
        */}
        <SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false} options={{ type: "classic" }}>
          <SyncManagerBootstrap />
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
