"use client";

import { useT } from "@/lib/i18n/client";
import type { TranslateVars } from "@/lib/i18n/translate";

/**
 * One live password check (filled green tick when met, empty ring when
 * not), as in the reference mockup's checklist. Only ever used for rules
 * the app actually enforces — showing a rule the server doesn't check
 * would tell users their password has to meet a bar it doesn't.
 */
/** `label` (and its `vars`) arrive in Greek and are shown in the chosen language. */
export function PasswordRule({ met, label, vars }: { met: boolean; label: string; vars?: TranslateVars }) {
  const t = useT();
  return (
    <p className="flex items-center gap-2.5 text-[15px] text-stone-600">
      <span
        aria-hidden="true"
        className={`flex size-5 shrink-0 items-center justify-center rounded-full ${met ? "bg-accent-700 text-white" : "border-2 border-stone-300"}`}
      >
        {met && (
          <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.2 5 8.6 9.5 3.6" />
          </svg>
        )}
      </span>
      {t(label, vars)}
      <span className="sr-only">{met ? t(" — εντάξει") : t(" — δεν πληρείται ακόμα")}</span>
    </p>
  );
}
