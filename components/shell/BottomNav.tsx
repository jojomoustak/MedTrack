"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "Σήμερα" },
  { href: "/medications", label: "Φάρμακα" },
  { href: "/calendar", label: "Ημερολόγιο" },
  { href: "/lists", label: "Λίστες" },
  { href: "/profile", label: "Προφίλ" },
] as const;

/** Phase 3 §1: persistent bottom tab bar, 5 items, icon+label always visible (icons omitted here — label-first, still meets the "never icon alone" accessibility rule since there's no icon-only affordance). */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Κύρια πλοήγηση"
      className="grid grid-cols-5 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center py-2 text-xs font-medium ${
              active ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-500"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
