"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, isLanguage, LANGUAGE_STORAGE_KEY, LOCALE_OF, type Language } from "@/lib/i18n/language";
import { translate, type TranslateVars, type Translator } from "@/lib/i18n/translate";

const listeners = new Set<() => void>();
/** The choice for this visit when storage can't keep it (private mode, storage full). */
let memoryLanguage: Language | null = null;

function snapshot(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Storage unavailable: the visit's own choice, below.
  }
  return memoryLanguage ?? DEFAULT_LANGUAGE;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Plain read, for code outside React (e.g. a request that names the language). */
export function getLanguage(): Language {
  return typeof window === "undefined" ? DEFAULT_LANGUAGE : snapshot();
}

export function setLanguage(language: Language): void {
  memoryLanguage = language;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Kept for this visit only.
  }
  document.documentElement.lang = language;
  listeners.forEach((listener) => listener());
}

/**
 * The language the screens are in. Prebuilt pages are Greek until the
 * phone's choice is read, a moment after they open.
 */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_LANGUAGE);
}

/** For dates and times: "el-GR" or "en-GB". */
export function useLocale(): string {
  return LOCALE_OF[useLanguage()];
}

/** `t("Καλημέρα")` → the text in the chosen language (`lib/i18n/translate.ts`). */
export function useT(): Translator {
  const language = useLanguage();
  return useCallback((greek: string, vars?: TranslateVars) => translate(language, greek, vars), [language]);
}

/** `<T>Καλημέρα</T>`: the same, as an element, so server-rendered pages can use it too. */
export function T({ children, vars }: { children: string; vars?: TranslateVars }) {
  return <>{useT()(children, vars)}</>;
}

/** Keeps `<html lang>` on the chosen language, for screen readers and spelling. */
export function DocumentLanguage() {
  const language = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return null;
}
