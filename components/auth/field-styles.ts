/**
 * Form field styling shared by the auth screens (Login, Register, Forgot/
 * Reset password), measured from the reference mockup (2026-10-04): bold
 * labels above tall white fields with soft corners and a hairline border
 * on the cream page, instead of short transparent inputs.
 */
export const FIELD_WRAPPER = "flex flex-col gap-2";
export const FIELD_LABEL = "text-[17px] font-semibold text-stone-800 dark:text-stone-200";
// Left padding only: callers add their own right padding (`pr-4`, or
// `pr-12` beside a trailing icon) — there's no tailwind-merge here, so a
// shared `px-*` plus a caller's `pr-*` would conflict unpredictably.
export const FIELD_INPUT =
  "min-h-14 w-full rounded-xl border border-stone-200 bg-white pl-4 text-base text-stone-900 shadow-[0_1px_2px_rgba(28,25,23,0.04)] placeholder:text-stone-400 focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-600/20 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100";
