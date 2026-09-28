# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Elena, 68 — multiple chronic conditions.** Takes 5–7 medications daily on different schedules (some fixed times, one every-8-hours). Moderate smartphone comfort; sometimes a family member helps set things up. Needs large text, simple confirmation actions, and reminders that fire reliably without her having to "open the app." Most safety-sensitive persona: a missed or double-counted dose matters most here.
- **Nikos, 34 — short-course & occasional medication.** Antibiotic course a few times a year, occasional PRN painkiller/allergy medication. Tech-savvy, wants low-friction add-by-scan and reminders that don't nag once the course ends.
- **Maria, 45 — single chronic condition, cost-conscious.** One daily thyroid medication, refills regularly. Wants low-stock warnings, a running estimate of when she'll run out, and a shopping list with prices so refills don't surprise her financially.
- **(Post-MVP) Caregiver** — adult child managing a parent's medications remotely, with limited management rights. Not designed into MVP screens yet, but the domain/auth model must not preclude it.

## Product Purpose

MedTrack (renamed from "MedTracking" — see Brand Commitments) helps a person in Greece manage their medications with confidence: know what to take and when, get reminded even without internet, track what's left, and never lose that history to a lost phone or a fresh install. It is a medication management, reminder, inventory, and adherence-tracking product — calm, trustworthy, and appropriate for daily health use. It is explicitly **not** a diagnostic, prescribing, or clinical decision-support product.

## Positioning

Reliability under real conditions a generic reminder/to-do app doesn't engineer for: native (not push-based) Android reminders that fire without connectivity or an open WebView; an inventory ledger (not a bare counter) with low-stock/expiry forecasting explicitly framed as non-medical; full multi-device sync with cloud-backed recovery after reinstall/clear-data; and a medical-safety boundary (no diagnostic/dosage/interaction logic) that is a standing product and regulatory constraint, not an oversight to fill in later.

## Operating Context

- Android-first today (a Median-wrapped WebView around this Next.js app), built to extend to iOS and other markets later. The native wrapper is a container, not a native design language — this app's design language is web.
- Used both online and offline; a large share of real usage (marking a dose, checking today's list) must work with zero connectivity.
- Greek-first: the shipped UI language is Greek at MVP; English/other languages are architecturally possible later but not shipped now.
- Real daily-health-routine context, not a one-off task: users open this multiple times a day, often under time pressure (about to take a pill) or low attention (elderly persona).
- Involves scanning physical medication packages (barcode/DataMatrix) and, optionally, photographing them.

## Capabilities and Constraints

- **Not a clinical tool.** No diagnostic, dosage-recommendation, or medication-substitution logic, ever. A schedule represents "what the user says they were prescribed," never a medical recommendation from this app.
- **Offline-first is core architecture.** Every mutating feature needs an explicit local-transaction → durable outbox → sync story, not optimistic UI state alone. A visual redesign must not regress this contract.
- **Reminders are native.** Routine dose reminders run through Android AlarmManager/Room/NotificationManager, never solely through push or an open WebView.
- **Catalog vs. user data are distinct entities, always** — a catalog product is never merged into a user's own medication record.
- **Money is integer cents or database-native decimal**, never floating point.
- **Server-side authorization is mandatory** for every sensitive operation.
- **Never log raw health data** — structured, redacted, pseudonymous logging only.
- **Clear Cache ≠ Clear App Data ≠ Delete Account** are three distinct, non-interchangeable actions with different real consequences (recoverable vs. only-recoverable-via-cloud-sync vs. permanent audited server-side deletion).
- Cross-cutting priority order when trade-offs conflict: **Safety → Data integrity → Security → Privacy → Reminder reliability → Offline reliability → Usability → Maintainability → Performance → Scalability → Dev speed.** Visual/UX work sits at "Usability" — well below the gates above it; a redesign must never compromise anything higher in this order to win on visual polish.
- Currently a personal/gift project, not yet published to the Play Store — no live-store-listing urgency, but the product is otherwise built and treated as production-grade, not a demo.

## Brand Commitments

- **Renaming in progress: "MedTracking" → "MedTrack."** Confirmed by the user (2026-09-27) to match a provided reference mockup. This touches the Android app label/config (separate native repo), web `metadata.title` and any other user-facing "MedTracking" string, and product docs — a real rename, not just a visual restyle.
- **Visual identity replacement, not refinement.** The incumbent identity (Material Teal `#009688` accent, a solid white-cross mark, Manrope typography, warm stone neutrals) was itself a deliberate, documented decision from earlier work — but the user has now explicitly rejected it in favor of a new reference: an emerald-green palette and a leaf logo mark, per a 22-screen mockup image supplied directly. New-work treats the old look as evidence/anti-reference only, not something to preserve or split the difference with.
- **Logo mark: outlined green cross with a leaf across its center** (user decision, 2026-09-28, superseding the leaf-only mark). The cross's lines stop in a thin gap wherever the leaf meets them, so the two interlock. Always green, never red: a red cross on white is a legally protected emblem.
- **Native Android icon/splash will also be regenerated** to match the new identity (confirmed by the user, 2026-09-27) — the separate Android repo (`C:\AndroidProjects\MedTracking-android`) currently ships a teal-cross launcher icon and splash screen; for full consistency this needs updating too, not just the in-app screens.
- The underlying product name change and rebrand do **not** change anything in Capabilities and Constraints above — those are load-bearing safety/architecture facts, independent of visual identity.

## Evidence on Hand

- A reference mockup image supplied directly by the user in this session: 22 annotated phone-frame screens (Today, Welcome, Login, Register, Forgot/Reset password, Privacy, Medications list, Medication Detail, Edit Medication, Add Adjustment, Photo capture, Add Medication, Manual Entry, Today Timeline, Calendar, Dose Detail, Shopping Lists, Shopping List Detail, Pharmacy Run, Profile, Delete Account) under the name "MedTrack," in an emerald-green/leaf-logo visual language. This is the primary visual-direction evidence for new-work.
- A real, already-functioning production app: a live Vercel deployment (`med-track-murex.vercel.app`), a real Postgres-backed account system, and a real Android WebView wrapper already installed on a physical test device — this redesign happens on top of live, working functionality, not a greenfield build.
- `docs/product/phase-0-product-definition.md` — the fuller original product-definition document this file summarizes; still the deeper reference for personas, journeys, and open risks.

## Product Principles

1. **Never let visual work create clinical-sounding content.** No dosage guidance, interaction warnings, or diagnostic language may be introduced as a side effect of new copy, icons, or empty-state text during the redesign.
2. **Preserve the offline/sync/reminder contracts exactly.** A card, button, or layout can change; the local-first write, outbox, and native-alarm behavior underneath it cannot, without a separate, explicit decision.
3. **Greek copy stays Greek.** The English reference mockup's copy is a layout/tone reference, not a translation source — existing Greek strings are preserved or adapted in Greek, never replaced with English to match the mockup literally.
4. **One identity, everywhere it's rendered.** The rebrand must land consistently across the web app, the native Android icon/splash, and any docs/config that name the product — a half-migrated brand (some screens green, some teal; native icon still showing the old mark) is worse than not starting.
5. **Elena's needs cap how far "bold" can go.** The most safety-sensitive persona needs large text, high contrast, and unambiguous (never color-only) status — visual ambition is real but bounded by WCAG AA and elderly-friendly usability, not traded away for a punchier look.

## Accessibility & Inclusion

WCAG AA contrast minimum; scalable text; large touch targets (persona Elena, 68, moderate smartphone comfort); full screen-reader semantics; status must never be communicated by color alone.
