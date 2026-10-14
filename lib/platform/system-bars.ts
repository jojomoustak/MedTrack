"use client";

import { useEffect } from "react";

interface BarSetter {
  set(options: { color: string; style: "light" | "dark" }): unknown;
}

type WindowWithMedianBars = Window & { median?: { statusbar?: BarSetter; systemNavBar?: BarSetter } };

/**
 * The app's own bar colours: must match `androidStatusBarBackgroundColor` /
 * `androidSystemNavBarColor` and the "light" styles in the Android repo's
 * `appConfig.json` (cream bars, dark icons).
 */
const APP_BARS = { color: "F8F5EE", style: "light" } as const;
/** A camera screen's: black bars with light icons, like the native scanner screens. */
const CAMERA_BARS = { color: "000000", style: "dark" } as const;

function setBars(bars: { color: string; style: "light" | "dark" }): void {
  const median = (window as WindowWithMedianBars).median;
  try {
    median?.statusbar?.set({ ...bars });
    median?.systemNavBar?.set({ ...bars });
  } catch {
    // Only looks: a bridge without these commands keeps the app's bars.
  }
}

/**
 * While a camera screen is open, the phone's status and navigation bars are
 * black, so the screen is black edge to edge like the native scanner
 * screens (2026-10-15); leaving puts the app's cream bars back. Uses the
 * Median bridge's own `statusbar` / `systemNavBar` commands; in a browser
 * it does nothing.
 */
export function useCameraSystemBars(): void {
  useEffect(() => {
    if (!(window as WindowWithMedianBars).median?.statusbar) return;
    setBars(CAMERA_BARS);
    const restore = () => setBars(APP_BARS);
    // A full page load away never runs the cleanup below.
    window.addEventListener("pagehide", restore);
    return () => {
      window.removeEventListener("pagehide", restore);
      restore();
    };
  }, []);
}
