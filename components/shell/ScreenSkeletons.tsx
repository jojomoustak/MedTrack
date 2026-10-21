"use client";

import { usePathname } from "next/navigation";
import { T } from "@/lib/i18n/client";
import { Skeleton, SkeletonCardRows, SkeletonField, SkeletonMedicationHeader, SkeletonStatus } from "@/components/ui/Skeleton";

/**
 * Each screen's loading state as a skeleton of that screen (2026-10-14,
 * replacing "Φόρτωση…"). Built from the shapes in `components/ui/Skeleton`,
 * sized like the real rows, so content lands where its placeholder was.
 * Real, data-free parts of a screen (its title, Today's greeting) are shown
 * as themselves by the screen instead of being skeletoned.
 */

/** Dose rows, as on Today and the Calendar (`TodayDoseRow`): the medicine's picture, two lines, the status circle. */
export function DoseRowsSkeleton({ count = 3 }: { count?: number }) {
  return <SkeletonCardRows count={count} tile="h-14 w-14 rounded-2xl" trailing="mr-1 size-12 rounded-full" lines={2} className="flex items-center gap-3 py-3 pr-2 pl-3" />;
}

/** Medication rows, as on the Medications tab. */
export function MedicationRowsSkeleton({ count = 4 }: { count?: number }) {
  return <SkeletonCardRows count={count} tile="h-15 w-15 rounded-2xl" lines={3} className="flex min-h-24 items-center gap-4 py-4 pr-3 pl-3.5" />;
}

/** The progress ring's place: a hollow ring like the real one, not a solid disc. */
function RingSkeleton() {
  return <span aria-hidden="true" className="block size-[92px] shrink-0 rounded-full border-[9px] border-stone-200/80 motion-safe:animate-pulse" />;
}

/** Today's doses section while its data loads: the real heading, the count and ring as placeholders, then rows. */
export function TodayDosesSkeleton() {
  return (
    <SkeletonStatus className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-[24px] font-bold tracking-tight text-stone-900">
            <T>Σημερινές δόσεις</T>
          </h2>
          <Skeleton className="h-4 w-36 rounded-md" />
        </div>
        <RingSkeleton />
      </div>
      <DoseRowsSkeleton />
    </SkeletonStatus>
  );
}

/** All of Today, for before the app shell knows who is signed in. */
function TodaySkeleton() {
  return (
    <SkeletonStatus className="flex flex-col gap-6 px-5 pt-1 pb-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-3/4 rounded-lg" />
        <Skeleton className="h-4 w-2/3 rounded-md" />
      </div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-21 rounded-2xl" />
        ))}
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 flex-col gap-2.5">
          <Skeleton className="h-6 w-1/2 rounded-md" />
          <Skeleton className="h-4 w-36 rounded-md" />
        </div>
        <RingSkeleton />
      </div>
      <DoseRowsSkeleton />
    </SkeletonStatus>
  );
}

/** All of the Medications tab, for the same moment. */
function MedicationsSkeleton() {
  return (
    <SkeletonStatus className="flex flex-col gap-5 px-5 pt-1 pb-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-1/3 rounded-lg" />
        <Skeleton className="h-12 w-32 rounded-xl" />
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <MedicationRowsSkeleton />
    </SkeletonStatus>
  );
}

/** Any other screen: a title and a few rows. */
function GenericSkeleton() {
  return (
    <SkeletonStatus className="flex flex-col gap-5 px-5 pt-1 pb-6">
      <Skeleton className="h-8 w-1/2 rounded-lg" />
      <SkeletonCardRows count={3} tile="h-12 w-12 rounded-xl" lines={2} className="flex min-h-20 items-center gap-4 px-4 py-3" />
    </SkeletonStatus>
  );
}

/**
 * What the app shell shows while the session is confirmed: the skeleton of
 * the screen being opened, so it hands over to that screen's own skeleton
 * (or its content) without a different placeholder in between.
 */
export function RouteSkeleton() {
  const pathname = usePathname();
  if (pathname === "/today") return <TodaySkeleton />;
  if (pathname === "/medications") return <MedicationsSkeleton />;
  return <GenericSkeleton />;
}

/** A medication's page: its header card, the tabs, and the overview's facts. */
export function MedicationDetailSkeleton() {
  return (
    <SkeletonStatus className="mx-auto flex max-w-md flex-col gap-5 px-5 pt-1 pb-6">
      <div className="surface-card flex items-start gap-4 p-4">
        <Skeleton className="h-15 w-15 shrink-0 rounded-2xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
          <Skeleton className="h-7 w-2/3 rounded-lg" />
          <Skeleton className="h-4 w-2/5 rounded-md" />
          <Skeleton className="mt-1 h-7 w-20 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="flex flex-col gap-5">
        {["w-1/2", "w-2/5", "w-1/3"].map((width, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-1/4 rounded-md" />
            <Skeleton className={`h-5 rounded-md ${width}`} />
          </div>
        ))}
      </div>
    </SkeletonStatus>
  );
}

/** The stock card on a medication's page. */
export function InventoryCardSkeleton() {
  return (
    <SkeletonStatus className="surface-card flex flex-col gap-3 p-4">
      <Skeleton className="h-4 w-1/4 rounded-md" />
      <Skeleton className="h-8 w-1/3 rounded-lg" />
      <Skeleton className="h-4 w-2/3 rounded-md" />
    </SkeletonStatus>
  );
}

/** A form screen about one medication (edit, new package, stock correction): its real title, the medication, the fields. */
export function MedicationFormSkeleton({ title, fields = 3 }: { title: string; fields?: number }) {
  return (
    <SkeletonStatus className="mx-auto flex max-w-md flex-col gap-6 px-5 pt-1 pb-6">
      <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900">{title}</h1>
      <SkeletonMedicationHeader />
      <FieldsSkeleton count={fields} />
    </SkeletonStatus>
  );
}

/** Just the fields, for a form whose header is already on screen. */
export function FieldsSkeleton({ count = 2 }: { count?: number }) {
  const labels = ["w-1/3", "w-2/5", "w-1/4", "w-1/3"];
  return (
    <div className="flex flex-col gap-5">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonField key={i} labelWidth={labels[i % labels.length]} />
      ))}
    </div>
  );
}

/** A dose's details: the real title, the medication's name, the facts card. */
export function DoseDetailSkeleton() {
  return (
    <SkeletonStatus className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight text-stone-900">
          <T>Λεπτομέρειες δόσης</T>
        </h1>
        <Skeleton className="h-5 w-2/5 rounded-md" />
      </div>
      <div className="surface-card divide-y divide-stone-100 px-4 py-1">
        {["w-1/2", "w-1/4", "w-1/3", "w-2/5"].map((width, i) => (
          <div key={i} className="flex items-center gap-3.5 py-3">
            <Skeleton className="size-11 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/4 rounded-md" />
              <Skeleton className={`h-3.5 rounded-md ${width}`} />
            </div>
          </div>
        ))}
      </div>
    </SkeletonStatus>
  );
}

/** A day's timeline card on the Calendar's day screen. */
export function DayTimelineSkeleton() {
  return (
    <SkeletonStatus className="surface-card flex flex-col px-4 py-2">
      {["w-1/2", "w-2/5", "w-3/5"].map((width, i) => (
        <div key={i} className="flex gap-3 py-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <Skeleton className={`h-4 rounded-md ${width}`} />
            <Skeleton className="h-3.5 w-1/4 rounded-md" />
          </div>
        </div>
      ))}
    </SkeletonStatus>
  );
}

/** Shopping lists (the Lists tab). */
export function ListRowsSkeleton() {
  return (
    <SkeletonStatus>
      <SkeletonCardRows count={3} tile="h-12 w-12 rounded-xl" lines={2} className="flex min-h-20 items-center gap-4 px-4 py-3" />
    </SkeletonStatus>
  );
}

/** A shopping list's items. */
export function ListItemsSkeleton() {
  return (
    <SkeletonStatus>
      <SkeletonCardRows count={3} tile="size-11 rounded-full" lines={2} className="flex min-h-19 items-center gap-3 py-2 pr-3 pl-2.5" />
    </SkeletonStatus>
  );
}

/** "Add medication"'s three ways in (`EntryChooser`). */
export function EntryChoicesSkeleton() {
  return (
    <SkeletonStatus className="mx-auto max-w-md px-5">
      <SkeletonCardRows count={3} tile="size-16 rounded-2xl" lines={2} className="flex min-h-24 items-center gap-4 p-4" />
    </SkeletonStatus>
  );
}

