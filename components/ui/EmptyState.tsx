import type { ReactNode } from "react";

/**
 * Shared empty-state shell — one visual language for "no medications yet,"
 * "no results for this filter," "no doses today," etc., instead of each
 * screen hand-rolling its own centered-text block. Never fabricates
 * content: `title`/`body` are always passed in by the caller, matching
 * what's actually true for that state.
 */
export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-50 text-accent-700 dark:bg-accent-950 dark:text-accent-400" aria-hidden="true">
        {icon}
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      {body && <p className="max-w-xs text-sm text-stone-600 dark:text-stone-400">{body}</p>}
      {action}
    </div>
  );
}
