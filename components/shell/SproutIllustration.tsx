import { useId } from "react";
import { ILLUSTRATION_PALETTE, LeafArt, type LeafSpec } from "@/components/shell/leaf-art";

/** Same plant as Welcome's illustration (its leaves, in that 390-wide coordinate space), without the backdrop — for small encouragement cards. */
const LEAVES: LeafSpec[] = [
  { base: { x: 170, y: 392 }, tip: { x: 52, y: 256 }, width: 0.47, bend: 0.03, skew: 0.9 },
  { base: { x: 190, y: 347 }, tip: { x: 315, y: 168 }, width: 0.46, bend: -0.04, skew: 1.08 },
  { base: { x: 203, y: 383 }, tip: { x: 295, y: 342 }, width: 0.44, bend: -0.05, skew: 0.92 },
];
const STEMS = ["M178 408 Q181 378 190 347", "M178 408 Q172 402 170 392", "M180 398 Q188 388 203 383"];
const STEM_WIDTH = 3.4;

export function SproutIllustration({ className = "" }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="40 160 285 255" className={className} aria-hidden="true" focusable="false">
      {STEMS.map((d) => (
        <path key={d} d={d} fill="none" stroke="#174F3B" strokeWidth={STEM_WIDTH} strokeLinecap="round" />
      ))}
      {LEAVES.map((spec, i) => (
        <LeafArt key={i} spec={spec} palette={ILLUSTRATION_PALETTE} id={`${uid}s${i}`} stemWidth={STEM_WIDTH} />
      ))}
    </svg>
  );
}
