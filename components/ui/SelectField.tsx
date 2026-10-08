import type { ComponentProps } from "react";
import { FIELD_INPUT, FIELD_LABEL, FIELD_WRAPPER } from "@/components/ui/field-styles";

/** A labelled native `<select>` in the shared field style, with the reference mockup's trailing chevron. */
export function SelectField({ label, children, ...props }: { label: string } & ComponentProps<"select">) {
  return (
    <label className={FIELD_WRAPPER}>
      <span className={FIELD_LABEL}>{label}</span>
      <span className="relative block">
        <select className={`${FIELD_INPUT} appearance-none pr-11`} {...props}>
          {children}
        </select>
        <svg
          viewBox="0 0 20 20"
          width="20"
          height="20"
          aria-hidden="true"
          focusable="false"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-stone-600 dark:text-stone-400"
        >
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </label>
  );
}
