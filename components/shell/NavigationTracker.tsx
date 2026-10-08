"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordPathname } from "@/lib/navigation/client/previous-path";

/** Records each route change for `getPreviousPathname` — mounted once, in the root layout. */
export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordPathname(pathname);
  }, [pathname]);
  return null;
}
