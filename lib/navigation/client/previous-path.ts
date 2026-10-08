/**
 * The in-app path the user was on before the current one — lets the header's
 * back chevron pop history when that IS the screen above (so Android's own
 * back button stays in step) and navigate up explicitly otherwise.
 * Module state, recorded by `NavigationTracker` on every route change.
 */
let current: string | null = null;
let previous: string | null = null;

export function recordPathname(pathname: string): void {
  if (pathname === current) return;
  previous = current;
  current = pathname;
}

export function getPreviousPathname(): string | null {
  return previous;
}
