/**
 * Welcome's centerpiece illustration (rebrand direction contract) — a
 * cluster of the same leaf silhouette `BrandMark` uses, at different
 * sizes/rotations/shades. Deliberately reuses BrandMark's own vector
 * language rather than a separate illustration style: crisp geometric
 * shapes, not a sketch/photo-style scene (craft floor: "real illustration
 * or none" — geometry is the "or none" that's still first-class here).
 *
 * No circular backdrop (design pass 2026-09-28, reference re-comparison):
 * the reference's Welcome illustration is the leaves alone on the page
 * background — a circular badge is this app's own pattern for a *single
 * small icon* (`AuthIconBadge`, used on Forgot/Reset password), not for
 * this multi-leaf hero composition. An earlier version added one anyway;
 * dropped to match.
 *
 * Bug found via a live on-device screenshot (2026-09-28, user: "3 leafs
 * not centered"): each leaf used `translate(dx dy) rotate(r) scale(s)`,
 * but SVG applies that right-to-left — scale first, about the origin, not
 * about the leaf path's own center (~(12,12) in its local 24x24 box). A
 * leaf's visual center after that lands at `(dx,dy) + rotate(r)·(12s,12s)`,
 * not at `(dx,dy)` — the bigger the scale, the further it drags from its
 * intended anchor. The scale=4.2 leaf ended up ~50 units off in both axes,
 * pulling the whole three-leaf cluster's visual mass down-and-right inside
 * the circle instead of centered in it. Fixed by nesting: the inner group
 * re-centers the leaf on its own origin first (`scale(s) translate(-12
 * -12)`, so its center maps to exactly (0,0) regardless of s), then the
 * outer group's `translate(dx dy) rotate(r)` places that already-centered
 * point exactly at (dx,dy) — rotation and scale no longer fight the
 * placement.
 */
export function WelcomeIllustration() {
  const leaf = "M12 3q7 5 7 10.5Q19 20 12 21.5Q5 20 5 13.5 5 8 12 3Z";
  const stem = "M12 21.7v1.8";

  const leaves = [
    { dx: 100, dy: 85, r: -8, s: 3.6, className: "fill-accent-600 dark:fill-accent-500" },
    { dx: 124, dy: 110, r: 22, s: 2.8, className: "fill-accent-400 dark:fill-accent-700" },
    { dx: 78, dy: 112, r: -25, s: 2.2, className: "fill-accent-800 dark:fill-accent-400" },
  ];

  return (
    <svg viewBox="25 15 150 150" width="180" height="180" aria-hidden="true" className="mx-auto">
      {leaves.map(({ dx, dy, r, s, className }, i) => (
        <g key={i} transform={`translate(${dx} ${dy}) rotate(${r})`} className={className}>
          <g transform={`scale(${s}) translate(-12 -12)`}>
            <path d={leaf} />
            <path d={stem} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </g>
        </g>
      ))}
    </svg>
  );
}
