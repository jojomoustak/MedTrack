import { useId } from "react";

/**
 * Welcome's centerpiece illustration, drawn from coordinates and colors
 * measured on the reference (2026-09-28): the reference screen was cropped
 * bezel-free, scaled to a 390-wide canvas, gridded, and pixel-sampled, so
 * every number below is in that 390-wide space.
 *
 * Two stacked SVGs: the backdrop (domes, lower hills, cream ground mound)
 * stretches to the full-bleed box with `preserveAspectRatio="none"` so it
 * always runs off both screen edges, while the leaves keep their true
 * proportions (`xMidYMax meet`, anchored to the ground line). The leaves
 * layer uses a tighter band so they fill most of the illustration's
 * height on a real phone; both layers share the bottom edge, so the root
 * stays inside the ground mound.
 *
 * Leaf detail matches a 10x zoom of the reference: each leaf is split
 * along a gently curved midrib into a lit half and a shaded half (light
 * from the upper-left), with a tapered pale midrib, faint secondary veins
 * angled toward the tip, a darker rim inside a light halo, and a soft
 * sheen on the lit half. Silhouettes are generated from a width profile
 * (widest ~40% up, tapering into the stem, pointed tip) with slightly
 * unequal halves, rather than a fixed symmetric curve.
 */
const BACKDROP_VIEWBOX = "0 60 390 365";
const LEAVES_VIEWBOX = "0 150 390 275";
const ROOT = { x: 178, y: 408 };
const LIGHT = { x: -0.7071, y: -0.7071 };

type Pt = { x: number; y: number };

interface LeafSpec {
  base: Pt;
  tip: Pt;
  /** Full width as a fraction of length. */
  width: number;
  /** Midrib bow as a fraction of length, positive toward the leaf's +normal side. */
  bend: number;
  /** Width multiplier for the -normal half, for a slightly lopsided leaf. */
  skew: number;
}

const LEAVES: LeafSpec[] = [
  { base: { x: 170, y: 392 }, tip: { x: 52, y: 256 }, width: 0.47, bend: 0.03, skew: 0.9 },
  { base: { x: 190, y: 347 }, tip: { x: 315, y: 168 }, width: 0.46, bend: -0.04, skew: 1.08 },
  { base: { x: 203, y: 383 }, tip: { x: 295, y: 342 }, width: 0.44, bend: -0.05, skew: 0.92 },
];

const STEMS = [
  `M${ROOT.x} ${ROOT.y} Q181 378 190 347`,
  `M${ROOT.x} ${ROOT.y} Q172 402 170 392`,
  `M180 398 Q188 388 203 383`,
];

const SAMPLES = 28;
const f = (n: number) => n.toFixed(2);
const pt = (p: Pt) => `${f(p.x)},${f(p.y)}`;

/** Catmull-Rom through `pts`, as cubic segments continuing from `pts[0]` (no leading M). */
function smooth(pts: Pt[]): string {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}

function leafGeometry({ base, tip, width, bend, skew }: LeafSpec) {
  const len = Math.hypot(tip.x - base.x, tip.y - base.y);
  const ux = (tip.x - base.x) / len;
  const uy = (tip.y - base.y) / len;
  const nx = -uy;
  const ny = ux;
  const ctrl = { x: (base.x + tip.x) / 2 + nx * bend * len * 2, y: (base.y + tip.y) / 2 + ny * bend * len * 2 };
  const half = (width * len) / 2;

  const mid = (t: number): Pt => ({
    x: (1 - t) ** 2 * base.x + 2 * (1 - t) * t * ctrl.x + t ** 2 * tip.x,
    y: (1 - t) ** 2 * base.y + 2 * (1 - t) * t * ctrl.y + t ** 2 * tip.y,
  });
  const normal = (t: number): Pt => {
    const dx = 2 * (1 - t) * (ctrl.x - base.x) + 2 * t * (tip.x - ctrl.x);
    const dy = 2 * (1 - t) * (ctrl.y - base.y) + 2 * t * (tip.y - ctrl.y);
    const m = Math.hypot(dx, dy);
    return { x: -dy / m, y: dx / m };
  };
  const profile = (t: number) => Math.sin(Math.PI * t ** 0.8) * Math.min(1, t / 0.12) ** 0.5;
  const edge = (t: number, side: 1 | -1): Pt => {
    const m = mid(t);
    const n = normal(t);
    const w = half * profile(t) * (side === 1 ? 1 : skew);
    return { x: m.x + n.x * w * side, y: m.y + n.y * w * side };
  };

  const ts = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
  const midPts = ts.map(mid);
  const edgePlus = ts.map((t) => edge(t, 1));
  const edgeMinus = ts.map((t) => edge(t, -1));

  const halfPath = (edgePts: Pt[]) => `M${pt(base)}${smooth(edgePts)}${smooth([...midPts].reverse())} Z`;
  const outline = `M${pt(base)}${smooth(edgePlus)}${smooth([...edgeMinus].reverse())} Z`;

  // Tapered midrib: a thin filled sliver, ~3 units wide at the base, ~0.5 at the far end.
  const ribTs = ts.filter((t) => t >= 0.04 && t <= 0.93);
  const ribSide = (side: 1 | -1) =>
    ribTs.map((t) => {
      const m = mid(t);
      const n = normal(t);
      const w = (3 * (1 - t) + 0.5 * t) / 2;
      return { x: m.x + n.x * w * side, y: m.y + n.y * w * side };
    });
  const ribA = ribSide(1);
  const ribB = ribSide(-1).reverse();
  const midrib = `M${pt(ribA[0])}${smooth(ribA)} L${pt(ribB[0])}${smooth(ribB)} Z`;

  // Secondary veins: from the midrib out toward each edge, angled toward the tip.
  const veins: string[] = [];
  for (const t0 of [0.28, 0.48, 0.68]) {
    for (const side of [1, -1] as const) {
      const start = mid(t0);
      const t1 = Math.min(0.95, t0 + 0.17);
      const e = edge(t1, side);
      const m1 = mid(t1);
      const end = { x: m1.x + (e.x - m1.x) * 0.8, y: m1.y + (e.y - m1.y) * 0.8 };
      const cm = mid(t0 + 0.05);
      const ce = edge(t0 + 0.05, side);
      const c = { x: cm.x + (ce.x - cm.x) * 0.45, y: cm.y + (ce.y - cm.y) * 0.45 };
      veins.push(`M${pt(start)} Q${pt(c)} ${pt(end)}`);
    }
  }

  const n50 = normal(0.45);
  const litSide: 1 | -1 = n50.x * LIGHT.x + n50.y * LIGHT.y > 0 ? 1 : -1;
  const center = mid(0.45);
  const reach = (side: 1 | -1) => ({ x: center.x + n50.x * half * side, y: center.y + n50.y * half * side });
  const sheen = mid(0.5);
  const sheenAt = { x: sheen.x + n50.x * half * 0.45 * litSide, y: sheen.y + n50.y * half * 0.45 * litSide };

  return {
    outline,
    plusHalf: halfPath(edgePlus),
    minusHalf: halfPath(edgeMinus),
    midrib,
    veins,
    litSide,
    center,
    plusReach: reach(1),
    minusReach: reach(-1),
    sheenAt,
    sheenR: half * 0.9,
    angle: (Math.atan2(uy, ux) * 180) / Math.PI,
  };
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0 Z`;
}

const LIT = { near: "#327F62", far: "#236A50" };
const SHADED = { near: "#1C5B45", far: "#12432F" };

export function WelcomeIllustration({ className = "" }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const leaves = LEAVES.map(leafGeometry);

  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <svg viewBox={BACKDROP_VIEWBOX} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {/* Two domes as one even-odd path: where they overlap the page
            background shows through, the light seam the reference has. */}
        <path
          d={`${ellipsePath(330, 400, 242, 322)} ${ellipsePath(100, 420, 122, 277)}`}
          fillRule="evenodd"
          className="fill-[#E6EBE0] dark:fill-[#18231e]"
        />
        <ellipse cx="-20" cy="470" rx="130" ry="180" className="fill-[#E0E8DB] dark:fill-[#1b2a23]" />
        <ellipse cx="380" cy="460" rx="170" ry="185" className="fill-[#C5D8C7] dark:fill-[#1f3329]" />
        <path d="M0 398 Q195 358 390 398 L390 430 L0 430 Z" className="fill-[#FCFBF7] dark:fill-stone-950" />
      </svg>

      <svg viewBox={LEAVES_VIEWBOX} preserveAspectRatio="xMidYMax meet" className="absolute inset-0 h-full w-full">
        <defs>
          {leaves.map((g, i) => {
            const plus = g.litSide === 1 ? LIT : SHADED;
            const minus = g.litSide === 1 ? SHADED : LIT;
            return (
              <g key={i}>
                <linearGradient id={`${uid}p${i}`} gradientUnits="userSpaceOnUse" x1={g.center.x} y1={g.center.y} x2={g.plusReach.x} y2={g.plusReach.y}>
                  <stop offset="0" stopColor={plus.near} />
                  <stop offset="1" stopColor={plus.far} />
                </linearGradient>
                <linearGradient id={`${uid}m${i}`} gradientUnits="userSpaceOnUse" x1={g.center.x} y1={g.center.y} x2={g.minusReach.x} y2={g.minusReach.y}>
                  <stop offset="0" stopColor={minus.near} />
                  <stop offset="1" stopColor={minus.far} />
                </linearGradient>
                <radialGradient
                  id={`${uid}s${i}`}
                  gradientUnits="userSpaceOnUse"
                  cx={g.sheenAt.x}
                  cy={g.sheenAt.y}
                  r={g.sheenR}
                  gradientTransform={`rotate(${g.angle} ${g.sheenAt.x} ${g.sheenAt.y}) translate(${g.sheenAt.x} ${g.sheenAt.y}) scale(1.8 0.7) translate(${-g.sheenAt.x} ${-g.sheenAt.y})`}
                >
                  <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
                  <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                </radialGradient>
                <clipPath id={`${uid}c${i}`}>
                  <path d={g.outline} />
                </clipPath>
              </g>
            );
          })}
        </defs>

        {/* Halos first, then stems, then leaves: a halo drawn after the
            stems would cut a light gap across each stem at the leaf base. */}
        {leaves.map((g, i) => (
          <path key={i} d={g.outline} strokeWidth="5" strokeLinejoin="round" className="fill-none stroke-[#FCFBF7] dark:stroke-stone-950" />
        ))}

        {STEMS.map((d) => (
          <path key={d} d={d} fill="none" stroke="#174F3B" strokeWidth="3.4" strokeLinecap="round" />
        ))}

        {leaves.map((g, i) => (
          <g key={i}>
            <path d={g.plusHalf} fill={`url(#${uid}p${i})`} />
            <path d={g.minusHalf} fill={`url(#${uid}m${i})`} />
            <g clipPath={`url(#${uid}c${i})`}>
              <path d={g.outline} fill={`url(#${uid}s${i})`} />
              {g.veins.map((v) => (
                <path key={v} d={v} fill="none" stroke="#A7D1BC" strokeOpacity="0.16" strokeWidth="1.6" strokeLinecap="round" />
              ))}
            </g>
            <path d={g.midrib} fill="#B5D9C7" fillOpacity="0.85" />
            <path d={g.outline} fill="none" stroke="#0D3A2A" strokeOpacity="0.55" strokeWidth="1.2" strokeLinejoin="round" />
          </g>
        ))}
      </svg>
    </div>
  );
}
