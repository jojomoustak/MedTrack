/** Local "YYYY-MM-DD" for the `?date=` query param all three Calendar views (Phase 3 §2.6) share, so switching segments never loses the selected date. */
export function dateToParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inverse of `dateToParam` — parses `?date=` back into a local `Date` (midnight local time). Falls back to today for a missing/malformed value, so a bare `/calendar/month` visit still works. */
export function paramToDate(param: string | null): Date {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const [y, m, d] = param.split("-").map(Number);
    const parsed = new Date(y, m - 1, d);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}
