"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";

/** Top-left back arrow on the auth sub-screens (Register, Forgot/Reset password), as in the reference mockup. */
export function AuthBackLink({ href }: { href: string }) {
  const t = useT();
  return (
    <Link href={href} aria-label={t("Πίσω")} className="-ml-3 flex size-11 items-center justify-center rounded-full text-stone-800">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5 8 12l7 7" />
      </svg>
    </Link>
  );
}
