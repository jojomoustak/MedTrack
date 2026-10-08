import { redirect } from "next/navigation";

/** The month grid moved to `/calendar` (reference mockup, screen 17); kept so existing links still land somewhere sensible. */
export default async function CalendarMonthRedirect({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  redirect(date ? `/calendar?date=${encodeURIComponent(date)}` : "/calendar");
}
