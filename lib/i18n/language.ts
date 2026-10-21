/**
 * The app's languages (owner's request, 2026-10-21: an English switch).
 * Greek is the source: every piece of text is written in Greek in the
 * code, and `lib/i18n/en.ts` maps each Greek text to its English one, so
 * anything not translated yet simply stays Greek.
 */
export type Language = "el" | "en";

export const DEFAULT_LANGUAGE: Language = "el";

/** Kept on the phone (not cleared on sign-out: it's the phone's choice, Welcome and Login included). */
export const LANGUAGE_STORAGE_KEY = "medtrack:language";

/** For dates and times. */
export const LOCALE_OF: Record<Language, string> = { el: "el-GR", en: "en-GB" };

export function isLanguage(value: unknown): value is Language {
  return value === "el" || value === "en";
}
