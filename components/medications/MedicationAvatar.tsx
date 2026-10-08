"use client";

import { useMedicationPhotoThumbnail } from "@/lib/medications/client/use-medication-photo-thumbnail";
import { medicationColorClasses } from "@/lib/medications/client/medication-color";
import type { MedicationForm } from "@/lib/domain/user-medication";

type Glyph = "tablet" | "capsule" | "drop" | "bottle" | "spray" | "syringe" | "patch" | "sachet";

const GLYPH_FOR_FORM: Record<MedicationForm, Glyph> = {
  tablet: "tablet",
  capsule: "capsule",
  drop: "drop",
  ml: "bottle",
  spray: "spray",
  injection: "syringe",
  patch: "patch",
  sachet: "sachet",
  mg: "tablet",
  mcg: "tablet",
  g: "tablet",
  dose: "tablet",
  other: "tablet",
};

/** Two-tone, filled form glyphs in the medication's own color — the reference mockup's tile art. Decorative: the row's text names the medication and its form. */
export function MedicationFormGlyph({ form, size = 40 }: { form: MedicationForm | null; size?: number }) {
  const glyph = form ? GLYPH_FOR_FORM[form] : "tablet";
  const svg = { viewBox: "0 0 32 32", width: size, height: size, "aria-hidden": true, focusable: false } as const;
  const shine = { stroke: "white", strokeOpacity: 0.65, strokeWidth: 1.7, strokeLinecap: "round", fill: "none" } as const;

  switch (glyph) {
    case "capsule":
      return (
        <svg {...svg}>
          <g transform="rotate(-45 16 16)">
            <path d="M16 9.5H9a6.5 6.5 0 0 0 0 13h7Z" fill="currentColor" />
            <path d="M16 9.5h7a6.5 6.5 0 0 1 0 13h-7Z" fill="currentColor" fillOpacity="0.4" />
            <path d="M7.6 13.2h5" {...shine} />
          </g>
        </svg>
      );
    case "drop":
      return (
        <svg {...svg}>
          <path d="M16 4.5c4.6 5.5 7.6 9.6 7.6 13.5a7.6 7.6 0 0 1-15.2 0c0-3.9 3-8 7.6-13.5Z" fill="currentColor" />
          <path d="M12.4 18.6a3.8 3.8 0 0 0 2.7 3.4" {...shine} />
        </svg>
      );
    case "bottle":
      return (
        <svg {...svg}>
          <rect x="12.5" y="3.5" width="7" height="4.5" rx="1.2" fill="currentColor" fillOpacity="0.5" />
          <path d="M11.8 9h8.4l1.8 3.2V25.5a2.2 2.2 0 0 1-2.2 2.2h-7.6a2.2 2.2 0 0 1-2.2-2.2V12.2Z" fill="currentColor" />
          <rect x="12.4" y="15" width="7.2" height="6.4" rx="1.2" fill="white" fillOpacity="0.55" />
        </svg>
      );
    case "spray":
      return (
        <svg {...svg}>
          <path d="M12.5 5.5h6.5v3h-6.5Z" fill="currentColor" />
          <rect x="13.6" y="8.5" width="4.4" height="3.6" fill="currentColor" fillOpacity="0.55" />
          <rect x="10.8" y="12" width="10" height="16" rx="2.6" fill="currentColor" />
          <circle cx="22.6" cy="5.6" r="1" fill="currentColor" fillOpacity="0.5" />
          <circle cx="25" cy="7.8" r="1" fill="currentColor" fillOpacity="0.5" />
          <circle cx="22.8" cy="9.8" r="1" fill="currentColor" fillOpacity="0.5" />
          <path d="M13.6 16v7" {...shine} />
        </svg>
      );
    case "syringe":
      return (
        <svg {...svg}>
          <g transform="rotate(-45 16 16)">
            <path d="M3.5 16h4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <rect x="8" y="12.6" width="13" height="6.8" rx="1.6" fill="currentColor" />
            <rect x="21" y="15" width="4" height="2" fill="currentColor" fillOpacity="0.55" />
            <rect x="25" y="12.2" width="2.2" height="7.6" rx="1.1" fill="currentColor" fillOpacity="0.55" />
            <path d="M11.5 12.6v2.6M14.5 12.6v2.6M17.5 12.6v2.6" stroke="white" strokeOpacity="0.7" strokeWidth="1.3" strokeLinecap="round" />
          </g>
        </svg>
      );
    case "patch":
      return (
        <svg {...svg}>
          <rect x="5.5" y="5.5" width="21" height="21" rx="5.5" fill="currentColor" fillOpacity="0.42" />
          <rect x="10" y="10" width="12" height="12" rx="3" fill="currentColor" />
          <path d="M12.8 13.2h3" {...shine} />
        </svg>
      );
    case "sachet":
      return (
        <svg {...svg}>
          <path d="M7.5 8.5 9.6 6.4l2.1 2.1 2.1-2.1 2.1 2.1 2.1-2.1 2.1 2.1 2.1-2.1 2.1 2.1V25.5a2.2 2.2 0 0 1-2.2 2.2H9.7a2.2 2.2 0 0 1-2.2-2.2Z" fill="currentColor" />
          <path d="M11 13h10" stroke="white" strokeOpacity="0.55" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case "tablet":
    default:
      return (
        <svg {...svg}>
          <circle cx="16" cy="16" r="12" fill="currentColor" />
          <circle cx="16" cy="16" r="7.2" fill="white" fillOpacity="0.2" />
          <path d="M13.2 16h5.6" stroke="white" strokeOpacity="0.6" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M9.4 11.6a8.4 8.4 0 0 1 4.6-3.7" {...shine} />
        </svg>
      );
  }
}

/**
 * A medication's tile on lists (reference mockup): its photo when one
 * exists, otherwise its form glyph on its stable color. Decorative only —
 * the surrounding row carries the name and is the tap target.
 *
 * `withPhoto` should be false for a medication not yet on the server (a
 * local-first create): the photo endpoint needs a real server row.
 */
export function MedicationAvatar({ medicationId, form, withPhoto }: { medicationId: string; form: MedicationForm | null; withPhoto: boolean }) {
  const color = medicationColorClasses(medicationId);
  return withPhoto ? <PhotoOrGlyph medicationId={medicationId} form={form} color={color} /> : <GlyphTile form={form} color={color} />;
}

function GlyphTile({ form, color }: { form: MedicationForm | null; color: { bg: string; text: string } }) {
  return (
    <span aria-hidden="true" className={`flex h-15 w-15 shrink-0 items-center justify-center rounded-2xl ${color.bg} ${color.text}`}>
      <MedicationFormGlyph form={form} />
    </span>
  );
}

function PhotoOrGlyph({ medicationId, form, color }: { medicationId: string; form: MedicationForm | null; color: { bg: string; text: string } }) {
  const { url } = useMedicationPhotoThumbnail(medicationId);
  if (!url) return <GlyphTile form={form} color={color} />;
  // eslint-disable-next-line @next/next/no-img-element -- a local object URL from IndexedDB/fetch, not an optimizable remote asset
  return <img src={url} alt="" aria-hidden="true" className="h-15 w-15 shrink-0 rounded-2xl object-cover" />;
}
