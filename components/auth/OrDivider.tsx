/** Shared "or continue with" rule-line divider between a form and its social-auth option (Login/Register). */
export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex w-full max-w-sm items-center gap-3 text-xs font-medium text-stone-400 dark:text-stone-500">
      <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
      {label}
      <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
    </div>
  );
}
