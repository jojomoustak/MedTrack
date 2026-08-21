"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const VISIBLE_ON = ["/today", "/medications"];

/** Phase 3 §1: FAB "Add Medication" floats above the tab bar, visible on Today & Medications only. */
export function AddMedicationFab() {
  const pathname = usePathname();
  if (!VISIBLE_ON.some((path) => pathname === path)) return null;

  return (
    <Link
      href="/medications/add"
      aria-label="Προσθήκη φαρμάκου"
      className="fixed right-4 bottom-20 flex min-h-14 min-w-14 items-center justify-center rounded-full bg-zinc-900 px-5 py-4 font-medium text-white shadow-lg dark:bg-zinc-50 dark:text-zinc-900"
    >
      + Φάρμακο
    </Link>
  );
}
