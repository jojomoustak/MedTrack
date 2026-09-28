/**
 * Welcome's centerpiece illustration. Rebuilt (2026-09-28, fourth pass —
 * user compared this file's previous version directly against a cropped,
 * upscaled reference screenshot and found it still wasn't close: the
 * leaves were too wide/round instead of slender and pointed, had no
 * visible stems (bases just touched at one point), were too uneven in
 * tone, and the hill backdrop was too flat and pale).
 *
 * A dedicated slender leaf shape (not `BrandMark`'s compact icon shape,
 * which is proportioned for a ~14-24px mark, not a ~90-unit illustration
 * blade) with an explicit stem segment per leaf: each leaf is a short
 * straight stem from the shared root point, then a narrow pointed blade
 * starting where that stem ends — matching the reference's visible
 * branching structure instead of three shapes whose bases merely overlap.
 *
 * Fifth pass (2026-09-28, same day — user: "They still dont look
 * identical, be more precise"): sampled actual pixel colors from the
 * reference PNG via .NET's `Bitmap.GetPixel` instead of eyeballing tone.
 * Two real, measurable corrections came out of that: the hill backdrop is
 * ONE flat, barely-there tint (~8-10% opacity over the page background at
 * every sampled point, not two differently-saturated layers — this file's
 * previous version used a solid `accent-100` plus a 35%-opacity
 * `accent-400` layer, both far more saturated than the reference actually
 * is), and all three leaves sample to the same color (~`#1f5d46`–`#27684f`
 * across every leaf, not the two different shades this file had). Button
 * green was also sampled (~`#016f53`) and already matches this app's
 * existing `accent-700` primary-button color, so that's confirmed
 * correct, not changed.
 *
 * Sixth pass (2026-09-28, same day — user: "It's not the same" -> asked
 * which part -> "the illustration + layout, check side by side"): built
 * an actual height-matched side-by-side composite of the reference crop
 * and this app's live render (.NET `Graphics.DrawImage` into one canvas)
 * instead of comparing two separate screenshots from memory. That made
 * three concrete gaps visible that no single-image comparison had caught:
 * the three leaves overlapped into a dense clump with almost no visible
 * gap between blades (reference clearly separates them), the left leaf
 * in particular was too needle-thin next to the reference's fuller one,
 * and the hills were too short relative to the leaves — reference's hill
 * crest sits much closer to where the leaves fan out. Widened the blade
 * ratio, lengthened each leaf's stem so blades start further apart before
 * they can overlap, and made the hills taller.
 */
function leafBlade(length: number, offset: number): string {
  const w = length * 0.19;
  const tip = -offset - length;
  const mid = -offset - length * 0.6;
  const near = -offset - length * 0.15;
  return `M0,${-offset} C${-w},${near} ${-w * 0.85},${mid} 0,${tip} C${w * 0.85},${mid} ${w},${near} 0,${-offset} Z`;
}

function leafVein(length: number, offset: number): string {
  return `M0,${-offset - length * 0.08} L0,${-offset - length * 0.9}`;
}

export function WelcomeIllustration() {
  const root = { x: 100, y: 155 };
  const leaves = [
    { angle: -34, stem: 16, length: 62 },
    { angle: 0, stem: 18, length: 90 },
    { angle: 42, stem: 13, length: 50 },
  ];

  return (
    <svg viewBox="0 0 200 190" width="240" height="228" aria-hidden="true" className="mx-auto">
      <ellipse cx="60" cy="230" rx="150" ry="180" className="fill-accent-600/10 dark:fill-accent-400/10" />
      <ellipse cx="150" cy="245" rx="130" ry="165" className="fill-accent-600/10 dark:fill-accent-400/10" />

      {leaves.map(({ angle, stem, length }, i) => (
        <g key={i} transform={`translate(${root.x} ${root.y}) rotate(${angle})`}>
          <path d={`M0,0 L0,${-stem}`} className="stroke-accent-900 dark:stroke-accent-800" strokeWidth={1.6} strokeLinecap="round" />
          <path d={leafBlade(length, stem)} className="fill-accent-800 dark:fill-accent-500" />
          <path d={leafVein(length, stem)} stroke="white" strokeOpacity="0.4" strokeWidth={1} strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}
