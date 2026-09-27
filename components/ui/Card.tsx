import Link from "next/link";
import type { ComponentProps, ElementType } from "react";

/**
 * The one card surface for the app: a hybrid border + soft single-layer
 * shadow in light mode (border only, no shadow, in dark — shadows don't
 * read on dark surfaces and stacking two shadow layers was the exact
 * "optically loud" pattern the redesign audit flagged). Replaces the
 * hand-copied `rounded-xl shadow-sm shadow-stone-300/40 dark:border
 * dark:border-stone-800` string that was duplicated across 7+ files.
 */
const BASE = "rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-[0_1px_2px_rgba(28,25,23,.05),0_1px_3px_rgba(28,25,23,.07)] dark:shadow-none";

export interface CardProps<T extends ElementType = "div"> {
  as?: T;
  className?: string;
}

export function Card<T extends ElementType = "div">({ as, className = "", ...props }: CardProps<T> & Omit<ComponentProps<T>, keyof CardProps<T>>) {
  const Tag = as ?? "div";
  return <Tag className={`${BASE} p-4 ${className}`} {...props} />;
}

/** A tappable card row (medication list item, list-detail link) — same surface, plus press feedback. Real `next/link`, never a `<div onClick>`. */
export function CardLink({ className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link className={`${BASE} flex items-center gap-3 p-3 transition-transform duration-150 active:scale-[0.98] ${className}`} {...props} />;
}
