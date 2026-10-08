"use client";

import { useRouter } from "next/navigation";
import { getPreviousPathname } from "@/lib/navigation/client/previous-path";

/**
 * After a form saves, go back to the screen it was opened from: pop
 * history when that screen is the previous one (so the device back button
 * doesn't return to the finished form), otherwise replace this screen with
 * it.
 */
export function useReturnTo(): (path: string) => void {
  const router = useRouter();
  return (path: string) => {
    if (getPreviousPathname() === path) router.back();
    else router.replace(path);
  };
}
