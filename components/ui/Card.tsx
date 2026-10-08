import Link from "next/link";
import type { ComponentProps, ElementType } from "react";

/**
 * The one card surface for the app — the `surface-card` utility
 * (`app/globals.css`): the reference mockup's white card with a soft
 * shadow on the cream page, border-only in dark mode.
 */
const BASE = "surface-card";

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
