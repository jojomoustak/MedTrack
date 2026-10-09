"use client";

import { usePathname } from "next/navigation";

/**
 * The record id in the current address, e.g. `abc` in `/medications/abc/edit`
 * (`index` = which "/"-separated segment holds it: 2 there).
 *
 * Screens keyed by an id (a medication, a list, a dose) are each ONE
 * prebuilt page — `next.config.ts` rewrites `/medications/<id>` to
 * `/medications/item` and so on — so they open as fast as any tab and work
 * offline without ever having been visited, instead of waiting on a server
 * function for every tap (measured 2026-10-08: ~0.4–1 s per tap on a
 * phone, the server being in the US). The id therefore comes from the
 * visible address, not from route params.
 *
 * During prerendering the address is the prebuilt page's own
 * (`/medications/item`); callers only use the id in effects and handlers,
 * so the first render matches either way.
 */
export function usePathId(index: number): string {
  return usePathname().split("/")[index] ?? "";
}
