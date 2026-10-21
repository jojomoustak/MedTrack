import { EN } from "@/lib/i18n/en";
import type { Language } from "@/lib/i18n/language";

export type TranslateVars = Record<string, string | number>;

/**
 * `greek` in `language`: as it is for Greek, its English entry for
 * English — or the Greek itself while it has none, never a blank.
 * `{name}` placeholders are filled from `vars` in either language.
 */
export function translate(language: Language, greek: string, vars?: TranslateVars): string {
  const template = language === "en" ? (EN[greek] ?? greek) : greek;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

export type Translator = (greek: string, vars?: TranslateVars) => string;

export function translatorFor(language: Language): Translator {
  return (greek, vars) => translate(language, greek, vars);
}
