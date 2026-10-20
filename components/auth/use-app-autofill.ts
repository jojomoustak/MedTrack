"use client";

import { useEffect } from "react";
import { getDefaultMobilePlatform } from "@/lib/platform/get-mobile-platform";

/**
 * In the Android app, whether Google's autofill may work on this screen.
 *
 * Create account and Reset password pass `false`: on their new-password
 * fields Google's "strong password" pop-up took focus about a second after
 * the keyboard opened and closed it, on every attempt to type (owner,
 * 2026-10-20, seen live; `autocomplete="off"` didn't stop it). It comes back
 * on when the screen closes. Sign-in passes `true`, in case a screen that
 * turned it off was left without closing (a full page load), so a saved
 * password still fills there.
 *
 * Nothing happens in a browser, or if the app doesn't answer.
 */
export function useAppAutofill(enabled: boolean): void {
  useEffect(() => {
    const platform = getDefaultMobilePlatform();
    if (!platform.isAvailable()) return;
    void platform.setAutofill(enabled).catch(() => {});
    if (enabled) return;
    return () => {
      void platform.setAutofill(true).catch(() => {});
    };
  }, [enabled]);
}
