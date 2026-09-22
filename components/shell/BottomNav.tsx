"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { playSound } from "@/lib/sound/client/play-sound";
import { NavIcon, type NavIconKind } from "@/components/shell/NavIcon";

const TABS: { href: string; label: string; icon: NavIconKind }[] = [
  { href: "/today", label: "Σήμερα", icon: "today" },
  { href: "/medications", label: "Φάρμακα", icon: "medications" },
  { href: "/calendar", label: "Ημερολόγιο", icon: "calendar" },
  { href: "/lists", label: "Λίστες", icon: "lists" },
  { href: "/profile", label: "Προφίλ", icon: "profile" },
];

/**
 * Phase 3 §1: persistent bottom tab bar, 5 items, icon+label always
 * visible. Real drawn icons (UX polish pass, 2026-09-22 — this bar
 * previously had none, a real outlier against the icon+label convention
 * virtually every mobile bottom nav follows) plus the accent color for
 * the active tab, replacing the plain zinc-900/zinc-50 inversion —
 * "which tab am I on" is exactly the kind of active/selected state the
 * one brand accent exists for.
 */
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
            onClick={() => playSound("button")}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 border-t-2 py-2 text-xs ${
              active ? "border-accent-700 font-semibold text-accent-700 dark:border-accent-400 dark:text-accent-400" : "border-transparent font-medium text-zinc-500 dark:text-zinc-400"
            }`}
          >
            <NavIcon kind={tab.icon} active={active} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
