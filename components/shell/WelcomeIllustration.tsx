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
 */
function leafBlade(length: number, offset: number): string {
  const w = length * 0.15;
  const tip = -offset - length;
  const mid = -offset - length * 0.6;
  const near = -offset - length * 0.15;
  return `M0,${-offset} C${-w},${near} ${-w * 0.85},${mid} 0,${tip} C${w * 0.85},${mid} ${w},${near} 0,${-offset} Z`;
}

function leafVein(length: number, offset: number): string {
  return `M0,${-offset - length * 0.08} L0,${-offset - length * 0.9}`;
}

export function WelcomeIllustration() {
  const root = { x: 100, y: 150 };
  const leaves = [
    { angle: -36, stem: 9, length: 66, className: "fill-accent-700 dark:fill-accent-600" },
    { angle: 5, stem: 11, length: 92, className: "fill-accent-800 dark:fill-accent-500" },
    { angle: 46, stem: 7, length: 52, className: "fill-accent-700 dark:fill-accent-600" },
  ];

  return (
    <svg viewBox="0 0 200 190" width="240" height="228" aria-hidden="true" className="mx-auto">
      <ellipse cx="65" cy="245" rx="145" ry="165" className="fill-accent-100 dark:fill-accent-900/40" />
      <ellipse cx="145" cy="260" rx="125" ry="150" className="fill-accent-400/35 dark:fill-accent-700/30" />

      {leaves.map(({ angle, stem, length, className }, i) => (
        <g key={i} transform={`translate(${root.x} ${root.y}) rotate(${angle})`}>
          <path d={`M0,0 L0,${-stem}`} className="stroke-accent-900 dark:stroke-accent-800" strokeWidth={1.6} strokeLinecap="round" />
          <path d={leafBlade(length, stem)} className={className} />
          <path d={leafVein(length, stem)} stroke="white" strokeOpacity="0.4" strokeWidth={1} strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}
