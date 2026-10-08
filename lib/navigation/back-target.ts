/**
 * Where the header's back chevron goes from a given screen.
 *
 * - `none`: a root tab (Today, Medications, Calendar, Lists, Profile) —
 *   nothing to go back to.
 * - `parent`: a screen with one fixed place above it (a medication's
 *   detail → the list; its edit/stock/photo screens → its detail). Going
 *   up is deterministic, not "whatever was last in history".
 * - `history`: a screen reached from more than one place (Dose Detail opens
 *   from Today and from Calendar) — back returns to wherever the user came
 *   from, falling back to `fallback` with no in-app history.
 */
export type BackTarget = { kind: "none" } | { kind: "parent"; href: string } | { kind: "history"; fallback: string };

const ROOT_PATHS = new Set(["/today", "/medications", "/calendar", "/calendar/month", "/lists", "/profile"]);

const RULES: [RegExp, (match: RegExpMatchArray) => BackTarget][] = [
  [/^\/calendar\/dose\/[^/]+$/, () => ({ kind: "history", fallback: "/today" })],
  [/^\/medications\/add$/, () => ({ kind: "parent", href: "/medications" })],
  [/^\/medications\/([^/]+)\/(?:edit|photo|inventory\/correct|packages\/add)$/, (m) => ({ kind: "parent", href: `/medications/${m[1]}` })],
  [/^\/medications\/[^/]+$/, () => ({ kind: "parent", href: "/medications" })],
  [/^\/lists\/[^/]+$/, () => ({ kind: "parent", href: "/lists" })],
  [/^\/profile\/.+$/, () => ({ kind: "parent", href: "/profile" })],
];

export function backTarget(pathname: string): BackTarget {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (ROOT_PATHS.has(path)) return { kind: "none" };
  for (const [pattern, target] of RULES) {
    const match = path.match(pattern);
    if (match) return target(match);
  }
  // An inner screen no rule knows about yet: still offer a way out.
  return { kind: "history", fallback: "/today" };
}
