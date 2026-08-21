/** Phase 3 §2.6 Calendar — owned by a later phase (adherence history/upcoming view). Calm, honest "coming soon," not a fabricated calendar. */
export default function CalendarPage() {
  return (
    <div className="flex flex-col items-center gap-2 p-8 text-center">
      <h1 className="text-xl font-semibold">Ημερολόγιο</h1>
      <p className="text-zinc-600 dark:text-zinc-400">Έρχεται σύντομα.</p>
    </div>
  );
}
