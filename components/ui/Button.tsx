import Link from "next/link";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "danger-outline";
export type ButtonSize = "lg" | "md" | "sm";

/**
 * One shared button visual language for the whole app (design-system
 * normalization pass — see docs/adr for the redesign this backs). Variants
 * map directly to the hierarchy this app settled on after the mockup
 * iteration: exactly one `primary` (solid) per screen/section, `secondary`
 * (outline) for peer actions, `tertiary` (text-only, no border/fill) for
 * low-emphasis actions that still need to exist (Skip/Snooze, "Correct
 * inventory"), and the two `danger` variants kept visually separate from
 * `secondary` so a destructive action never reads as a routine one.
 */
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent-700 text-white dark:bg-accent-500 dark:text-stone-950",
  secondary: "border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100",
  tertiary: "text-stone-600 dark:text-stone-400 font-semibold",
  danger: "bg-red-700 text-white",
  "danger-outline": "border border-red-300 dark:border-red-900 text-red-700 dark:text-red-400",
};

// Rounded rectangles, not pills: every button in the reference mockup
// (2026-09-28 comparison) has visible corners, on every screen.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  lg: "min-h-14 px-6 text-lg rounded-2xl",
  md: "min-h-12 px-5 text-sm rounded-xl",
  sm: "min-h-11 px-4 text-sm rounded-xl",
};

export function buttonClasses(variant: ButtonVariant, size: ButtonSize = "md", className = ""): string {
  return `inline-flex items-center justify-center gap-1.5 font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`;
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** Real `<button>` for in-page actions — never a styled `<div>` (Tab/screen-reader semantics). */
export function Button({ variant = "primary", size = "md", fullWidth, className = "", ...props }: ButtonProps) {
  return <button type="button" className={buttonClasses(variant, size, `${fullWidth ? "w-full" : ""} ${className}`)} {...props} />;
}

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** Same visual language as `Button`, but a real `<a>` via `next/link` for navigation (never a button that navigates). */
export function ButtonLink({ variant = "primary", size = "md", fullWidth, className = "", ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, `${fullWidth ? "w-full" : ""} ${className}`)} {...props} />;
}
