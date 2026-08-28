import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SyncManagerBootstrap } from "@/components/shell/SyncManagerBootstrap";
import { SerwistProvider } from "@serwist/turbopack/react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MedTracking",
  description: "Παρακολούθηση φαρμάκων, δόσεων και αποθέματος — ακόμα και χωρίς σύνδεση.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="el"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
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
        */}
        <SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false}>
          <SyncManagerBootstrap />
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
