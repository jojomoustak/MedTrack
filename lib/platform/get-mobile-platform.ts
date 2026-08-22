import { MedianMobilePlatform } from "@/lib/platform/median-mobile-platform";
import type { MobilePlatform } from "@/lib/platform/mobile-platform";

let platformSingleton: MobilePlatform | undefined;

/** Shared default `MobilePlatform` instance — every call site that doesn't have an injected instance (tests, DI) should go through this rather than constructing its own `MedianMobilePlatform`. */
export function getDefaultMobilePlatform(): MobilePlatform {
  return (platformSingleton ??= new MedianMobilePlatform());
}

/** Test-only: swap in a fake platform (or clear it) instead of the real singleton. */
export function __setMobilePlatformForTests(platform: MobilePlatform | undefined): void {
  platformSingleton = platform;
}
