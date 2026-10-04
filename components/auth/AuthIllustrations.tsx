import { useId } from "react";
import { ILLUSTRATION_PALETTE, LeafArt } from "@/components/shell/leaf-art";

/**
 * Large illustrated badges for Forgot/Reset password, matched to the
 * reference mockup (2026-10-04): a pale sage disc (the same tone as the
 * Welcome illustration's hills) holding a green envelope with a leaf
 * tucked into it, or a green padlock whose body carries a plus. They
 * replace the small outline-icon badges an earlier pass used.
 */
const DISC = "fill-[#E6EBE0] dark:fill-[#18231e]";

export function ForgotPasswordIllustration({ className = "" }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3AA87B" />
          <stop offset="1" stopColor="#0F6E4C" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="50" className={DISC} />
      <rect x="24" y="44" width="52" height="34" rx="4" fill="#165F45" />
      <rect x="31" y="27" width="34" height="36" rx="3" fill="#EEF5EF" transform="rotate(-7 48 45)" />
      <LeafArt
        spec={{ base: { x: 49, y: 62 }, tip: { x: 78, y: 21 }, width: 0.46, bend: -0.04, skew: 1.06 }}
        palette={ILLUSTRATION_PALETTE}
        id={`${id}l`}
        veinCount={2}
        stalk={0}
      />
      <path d="M24 50 L50 66 L76 50 V74 A4 4 0 0 1 72 78 H28 A4 4 0 0 1 24 74 Z" fill={`url(#${id}f)`} />
      <path d="M24 76 L45 62 M76 76 L55 62" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function ResetPasswordIllustration({ className = "" }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2FA174" />
          <stop offset="1" stopColor="#0B5E42" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="50" className={DISC} />
      <path d="M37 47 V37 A13 13 0 0 1 63 37 V47" fill="none" stroke="#0E6B4A" strokeWidth="7" strokeLinecap="round" />
      <rect x="28" y="44" width="44" height="38" rx="8" fill={`url(#${id}b)`} />
      <rect x="28" y="44" width="44" height="6" rx="3" fill="#FFFFFF" opacity="0.12" />
      <rect x="47" y="53" width="6" height="20" rx="2" fill="#FFFFFF" />
      <rect x="40" y="60" width="20" height="6" rx="2" fill="#FFFFFF" />
    </svg>
  );
}
