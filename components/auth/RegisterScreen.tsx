"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckEmailPanel } from "@/components/auth/CheckEmailPanel";
import { GoogleAuthButton } from "@/components/auth/GoogleAuthButton";
import { RegisterForm, type RegisterValues } from "@/components/auth/RegisterForm";
import { BrandLockup } from "@/components/shell/BrandMark";
import { T } from "@/lib/i18n/client";

/**
 * The Register page's content, then "check your email" in its place once
 * the account is created (it can't be signed in to before that). Going back
 * to fix the email refills the form.
 */
export function RegisterScreen() {
  const [registered, setRegistered] = useState<RegisterValues | null>(null);
  const [editing, setEditing] = useState<RegisterValues | undefined>(undefined);

  if (registered) {
    return (
      <div className="mt-2">
        <CheckEmailPanel
          email={registered.email}
          password={registered.password}
          onChangeEmail={() => {
            setEditing(registered);
            setRegistered(null);
          }}
        />
      </div>
    );
  }

  return (
    <>
      <BrandLockup iconSize={72} textClassName="text-[30px] leading-none" className="self-center" />

      <h1 className="mt-7 text-[27px] font-bold leading-tight tracking-tight text-stone-900">
        <T>Δημιουργία λογαριασμού</T>
      </h1>
      <p className="mt-2 text-lg leading-snug text-stone-600">
        <T>Λίγα στοιχεία μόνο, και θα σας βοηθάμε να θυμάστε τα φάρμακά σας.</T>
      </p>

      <div className="mt-6">
        <RegisterForm initial={editing} onRegistered={setRegistered} />
      </div>

      {/* Owner's request 2026-10-21. A Google account arrives confirmed, so no email step;
          one that already exists just signs in. Its errors are shown on Login (`mapGoogleAuthError`). */}
      <p className="mt-6 text-center text-base text-stone-500">
        <T>ή</T>
      </p>
      <div className="mt-4">
        <GoogleAuthButton
          mode="sign-in"
          callbackURL="/today"
          errorCallbackURL="/login"
          label="Συνέχεια με Google"
          size="lg"
          fullWidth
          className="bg-white shadow-[0_1px_3px_rgba(28,25,23,0.06)]"
        />
      </div>

      {/* Balanced, with the link kept whole: it used to hang alone on a second line, or break in two (owner-reported 2026-10-21). */}
      <p className="mt-5 text-center text-sm leading-relaxed text-balance text-stone-500">
        <T>Δημιουργώντας λογαριασμό, συμφωνείτε με την</T>{" "}
        <Link href="/privacy" className="font-semibold whitespace-nowrap text-accent-700">
          <T>Πολιτική Απορρήτου</T>
        </Link>
        .
      </p>

      <p className="mt-6 text-center text-[15px] text-stone-600">
        <T>Έχετε ήδη λογαριασμό;</T>{" "}
        <Link href="/login" className="font-semibold text-accent-700">
          <T>Σύνδεση</T>
        </Link>
      </p>
    </>
  );
}
