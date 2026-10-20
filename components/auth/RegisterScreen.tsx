"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckEmailPanel } from "@/components/auth/CheckEmailPanel";
import { RegisterForm, type RegisterValues } from "@/components/auth/RegisterForm";
import { BrandLockup } from "@/components/shell/BrandMark";

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

      <h1 className="mt-7 text-[27px] font-bold leading-tight tracking-tight text-stone-900">Δημιουργία λογαριασμού</h1>
      <p className="mt-2 text-lg leading-snug text-stone-600">Λίγα στοιχεία μόνο, και θα σας βοηθάμε να θυμάστε τα φάρμακά σας.</p>

      <div className="mt-6">
        <RegisterForm initial={editing} onRegistered={setRegistered} />
      </div>

      <p className="mt-5 text-center text-sm leading-relaxed text-stone-500">
        Δημιουργώντας λογαριασμό, συμφωνείτε με την{" "}
        <Link href="/privacy" className="font-semibold text-accent-700">
          Πολιτική Απορρήτου
        </Link>
        .
      </p>

      <p className="mt-6 text-center text-[15px] text-stone-600">
        Έχετε ήδη λογαριασμό;{" "}
        <Link href="/login" className="font-semibold text-accent-700">
          Σύνδεση
        </Link>
      </p>
    </>
  );
}
