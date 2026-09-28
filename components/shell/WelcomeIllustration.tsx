import { useId } from "react";
import { LEAF_PATH, LEAF_VEIN_PATH } from "@/components/shell/BrandMark";

/**
 * Welcome's centerpiece illustration. Rebuilt (2026-09-28, third pass —
 * user: "It doesnt look identical. Be more careful") after cropping and
 * upscaling the actual reference screen rather than eyeballing the small
 * grid thumbnail. The reference is a 3-leaf sprout growing from one
 * common base point (not three independent leaves scattered inside a
 * circle), each leaf showing `BrandMark`'s own vein detail, sitting over
 * a soft two-tone "hill" backdrop that fades into the page — not a flat
 * circular badge (that treatment is reserved for single-icon badges like
 * `AuthIconBadge` on Forgot/Reset password).
 *
 * Each leaf reuses `LEAF_PATH`/`LEAF_VEIN_PATH` from `BrandMark` directly
 * (one shape, one source of truth) but with its own placement math: the
 * path's local origin is its base tip (12,22), so `translate(stem)
 * rotate(angle) scale(s)` fans each leaf out from a single shared point
 * with no separate re-centering step needed (unlike a shape whose local
 * origin sits away from its anchor, which was the exact bug in the
 * previous version — see git history).
 */
export function WelcomeIllustration() {
  const hillsId = useId();

  const leaves = [
    { angle: -30, scale: 3.1, className: "fill-accent-700 dark:fill-accent-600" },
    { angle: 0, scale: 3.9, className: "fill-accent-800 dark:fill-accent-500" },
    { angle: 26, scale: 2.7, className: "fill-accent-700 dark:fill-accent-600" },
  ];

  return (
    <svg viewBox="0 0 200 170" width="240" height="204" aria-hidden="true" className="mx-auto">
      <defs>
        <clipPath id={hillsId}>
          <rect x="0" y="0" width="200" height="170" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${hillsId})`}>
        <ellipse cx="50" cy="195" rx="100" ry="85" className="fill-accent-50 dark:fill-accent-950" />
        <ellipse cx="150" cy="205" rx="90" ry="80" className="fill-accent-100 dark:fill-accent-900/50" />
      </g>

      {leaves.map(({ angle, scale, className }, i) => (
        <g key={i} transform={`translate(100 148) rotate(${angle}) scale(${scale})`} className={className}>
          <path d={LEAF_PATH} transform="translate(-12 -22)" />
          <path d={LEAF_VEIN_PATH} transform="translate(-12 -22)" stroke="white" strokeOpacity="0.4" strokeWidth={0.9} strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}
