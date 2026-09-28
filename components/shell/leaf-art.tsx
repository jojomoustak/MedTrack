/**
 * One detailed leaf, shared by the Welcome illustration and the large logo
 * lockup so both carry the same surface detail measured from the reference
 * mockup (2026-09-28, 10x zooms + pixel samples): each leaf is split along
 * a gently bowed midrib into a lit half (light from the upper-left) and a
 * shaded half, with a darker rim, a soft sheen on the lit half, optional
 * faint side veins, and a midrib that is a soft green highlight — brightest
 * near the base, fading toward the tip — with a thin dark groove along its
 * shaded side. The reference midrib samples at ~#92C2A9 near the base down
 * to ~#427D67 mid-leaf; an earlier near-white, full-length midrib read as
 * a fake white stick.
 *
 * All line widths scale with leaf length, so the same code works for a
 * ~220-unit illustration leaf and a ~23-unit logo leaf.
 */
export type Pt = { x: number; y: number };

export interface LeafSpec {
  base: Pt;
  tip: Pt;
  /** Full width as a fraction of length. */
  width: number;
  /** Midrib bow as a fraction of length, positive toward the leaf's +normal side. */
  bend: number;
  /** Width multiplier for the -normal half, for a slightly lopsided leaf. */
  skew: number;
}

export interface LeafPalette {
  lit: { near: string; far: string };
  shaded: { near: string; far: string };
  rim: string;
  rimOpacity: number;
  /** Midrib highlight stops along its length: [offset 0..1, color, opacity]. */
  rib: [number, string, number][];
  groove: string;
  vein: string;
  veinOpacity: number;
  sheenOpacity: number;
  stalk: string;
}

export const ILLUSTRATION_PALETTE: LeafPalette = {
  lit: { near: "#327F62", far: "#236A50" },
  shaded: { near: "#1C5B45", far: "#12432F" },
  rim: "#0D3A2A",
  rimOpacity: 0.55,
  rib: [
    [0.14, "#92C2A9", 0.9],
    [0.5, "#5E9A7F", 0.7],
    [1, "#3F7A62", 0.15],
  ],
  groove: "#0D402F",
  vein: "#A7D1BC",
  veinOpacity: 0.16,
  sheenOpacity: 0.16,
  stalk: "#174F3B",
};

export const LOGO_PALETTE: LeafPalette = {
  lit: { near: "#0C7F5C", far: "#077258" },
  shaded: { near: "#056C4F", far: "#045E44" },
  rim: "#0A5A42",
  rimOpacity: 0.7,
  rib: [
    [0.12, "#7CC4AC", 0.95],
    [0.55, "#5FAB95", 0.9],
    [1, "#4E9A82", 0.2],
  ],
  groove: "#0E5F47",
  vein: "#8FD0B8",
  veinOpacity: 0,
  sheenOpacity: 0.14,
  stalk: "#0A6049",
};

const LIGHT = { x: -0.7071, y: -0.7071 };
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

function frame({ base, tip, width, bend, skew }: LeafSpec) {
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
  return { len, ux, uy, half, mid, normal, edge, ts };
}

/** The leaf's full silhouette — for halos drawn separately, beneath stems. */
export function leafOutline(spec: LeafSpec): string {
  const { edge, ts } = frame(spec);
  const plus = ts.map((t) => edge(t, 1));
  const minus = ts.map((t) => edge(t, -1));
  return `M${pt(spec.base)}${smooth(plus)}${smooth([...minus].reverse())} Z`;
}

export function LeafArt({
  spec,
  palette,
  id,
  ribEnd = 0.93,
  ribWidth = 0.013,
  veinCount = 3,
  stalk = 0,
  stemWidth = 0,
}: {
  spec: LeafSpec;
  palette: LeafPalette;
  /** Unique, url()-safe prefix for this leaf's gradient/clip ids. */
  id: string;
  ribEnd?: number;
  /** Midrib width at its base, as a fraction of leaf length. */
  ribWidth?: number;
  veinCount?: number;
  /** Length of a stalk extending back from the base, as a fraction of leaf length. */
  stalk?: number;
  /**
   * Width (absolute units) of the stem/stalk entering this leaf. When set,
   * the midrib starts at the base at this width, in the stem's color, and
   * blends into the highlight — so the stem visibly continues into the
   * leaf as its midrib, instead of stopping at the base point.
   */
  stemWidth?: number;
}) {
  const { len, ux, uy, half, mid, normal, edge, ts } = frame(spec);
  const { base } = spec;
  const midPts = ts.map(mid);
  const plusPts = ts.map((t) => edge(t, 1));
  const minusPts = ts.map((t) => edge(t, -1));
  const halfPath = (edgePts: Pt[]) => `M${pt(base)}${smooth(edgePts)}${smooth([...midPts].reverse())} Z`;
  const outline = `M${pt(base)}${smooth(plusPts)}${smooth([...minusPts].reverse())} Z`;

  const n45 = normal(0.45);
  const litSide: 1 | -1 = n45.x * LIGHT.x + n45.y * LIGHT.y > 0 ? 1 : -1;
  const center = mid(0.45);
  const reach = (side: 1 | -1) => ({ x: center.x + n45.x * half * side, y: center.y + n45.y * half * side });
  const plusTone = litSide === 1 ? palette.lit : palette.shaded;
  const minusTone = litSide === 1 ? palette.shaded : palette.lit;

  const sheenC = mid(0.5);
  const sheenAt = { x: sheenC.x + n45.x * half * 0.45 * litSide, y: sheenC.y + n45.y * half * 0.45 * litSide };
  const angle = (Math.atan2(uy, ux) * 180) / Math.PI;

  // Midrib: a tapered filled sliver. With a stem it starts right at the
  // base at the stem's width and narrows to the rib width by ~15% up;
  // without one it starts just inside the base.
  const ribT0 = stemWidth > 0 ? 0 : 0.04;
  const ribTs = [ribT0, ...ts.filter((t) => t > ribT0 && t <= ribEnd)];
  const ribW0 = len * ribWidth;
  const ribW1 = len * ribWidth * 0.15;
  const ribWidthAt = (t: number) => {
    if (stemWidth > 0 && t < 0.15) return stemWidth + (ribW0 - stemWidth) * (t / 0.15);
    const k = (t - 0.15) / (ribEnd - 0.15);
    return ribW0 * (1 - Math.max(0, k)) + ribW1 * Math.max(0, k);
  };
  const ribSide = (side: 1 | -1) =>
    ribTs.map((t) => {
      const m = mid(t);
      const n = normal(t);
      const w = ribWidthAt(t) / 2;
      return { x: m.x + n.x * w * side, y: m.y + n.y * w * side };
    });
  const ribA = ribSide(1);
  const ribB = ribSide(-1).reverse();
  const midrib = `M${pt(ribA[0])}${smooth(ribA)} L${pt(ribB[0])}${smooth(ribB)} Z`;
  const ribStart = mid(ribT0);
  const ribStop = mid(ribEnd);
  const ribStops: [number, string, number][] = stemWidth > 0 ? [[0, palette.stalk, 1], ...palette.rib] : palette.rib;

  // Groove: a thin dark line just off the midrib on the shaded side.
  const shadedSide = (litSide === 1 ? -1 : 1) as 1 | -1;
  const groovePts = ts
    .filter((t) => t >= 0.06 && t <= ribEnd * 0.85)
    .map((t) => {
      const m = mid(t);
      const n = normal(t);
      const off = ribW0 * 0.9 * (1 - t * 0.6);
      return { x: m.x + n.x * off * shadedSide, y: m.y + n.y * off * shadedSide };
    });
  const groove = `M${pt(groovePts[0])}${smooth(groovePts)}`;

  const veins: string[] = [];
  const veinTs = veinCount === 3 ? [0.28, 0.48, 0.68] : veinCount === 2 ? [0.35, 0.6] : [];
  for (const t0 of veinTs) {
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

  const stalkEnd = { x: base.x - ux * stalk * len, y: base.y - uy * stalk * len };

  return (
    <g>
      <defs>
        <linearGradient id={`${id}p`} gradientUnits="userSpaceOnUse" x1={center.x} y1={center.y} x2={reach(1).x} y2={reach(1).y}>
          <stop offset="0" stopColor={plusTone.near} />
          <stop offset="1" stopColor={plusTone.far} />
        </linearGradient>
        <linearGradient id={`${id}m`} gradientUnits="userSpaceOnUse" x1={center.x} y1={center.y} x2={reach(-1).x} y2={reach(-1).y}>
          <stop offset="0" stopColor={minusTone.near} />
          <stop offset="1" stopColor={minusTone.far} />
        </linearGradient>
        <linearGradient id={`${id}r`} gradientUnits="userSpaceOnUse" x1={ribStart.x} y1={ribStart.y} x2={ribStop.x} y2={ribStop.y}>
          {ribStops.map(([offset, color, opacity], i) => (
            <stop key={i} offset={offset} stopColor={color} stopOpacity={opacity} />
          ))}
        </linearGradient>
        <radialGradient
          id={`${id}s`}
          gradientUnits="userSpaceOnUse"
          cx={sheenAt.x}
          cy={sheenAt.y}
          r={half * 0.9}
          gradientTransform={`rotate(${angle} ${sheenAt.x} ${sheenAt.y}) translate(${sheenAt.x} ${sheenAt.y}) scale(1.8 0.7) translate(${-sheenAt.x} ${-sheenAt.y})`}
        >
          <stop offset="0" stopColor="#FFFFFF" stopOpacity={palette.sheenOpacity} />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <path d={outline} />
        </clipPath>
      </defs>

      {stalk > 0 && (
        <path d={`M${pt(base)} L${pt(stalkEnd)}`} stroke={palette.stalk} strokeWidth={len * 0.022} strokeLinecap="round" />
      )}
      <path d={halfPath(plusPts)} fill={`url(#${id}p)`} />
      <path d={halfPath(minusPts)} fill={`url(#${id}m)`} />
      <g clipPath={`url(#${id}c)`}>
        <path d={outline} fill={`url(#${id}s)`} />
        {veins.map((v) => (
          <path key={v} d={v} fill="none" stroke={palette.vein} strokeOpacity={palette.veinOpacity} strokeWidth={len * 0.0075} strokeLinecap="round" />
        ))}
        <path d={groove} fill="none" stroke={palette.groove} strokeOpacity="0.6" strokeWidth={len * 0.005} strokeLinecap="round" />
      </g>
      <path d={outline} fill="none" stroke={palette.rim} strokeOpacity={palette.rimOpacity} strokeWidth={len * 0.0055} strokeLinejoin="round" />
      {/* Unclipped and last: near the base the rib is wider than the leaf
          itself (it's still the stem there), so clipping would cut it. */}
      <path d={midrib} fill={`url(#${id}r)`} />
    </g>
  );
}
