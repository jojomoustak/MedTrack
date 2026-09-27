---
version: 1
slug: "global-rebrand"
primary_target: "global-rebrand"
related_targets: []
---

## Direction contract

THESIS: MedTrack reads as a calm, botanical health companion, not a clinical dashboard — the category default it refuses is the cold teal/cross "medical utility" look the app shipped with until today. Every screen leads with a real, personal data point (today's greeting, a completion ring, a medication's own color) before it leads with a form.

OWN-WORLD: A single leaf mark (two curved leaf-blade paths meeting at a stem) replaces the cross. Primary color is a deep forest-emerald (header/hero surfaces, primary buttons, active nav) with a brighter mid-emerald for interactive accents, over a warm off-white page background (not clinical white/gray) and white elevated cards with a soft, single-layer shadow (radius 16–20px, never sharp). Body/display type stays a humanist sans (Manrope, already licensed and loaded — kept, not replaced: the reference's own type is a generic system sans, and Manrope reads at least as warm while avoiding a font-loading regression). Medication identity is color-coded: each medication gets a stable, deterministically-assigned accent (blue/amber/rose/violet/emerald) carried on its avatar chip, dose-card leading edge, and any place it needs to be told apart from another medication at a glance — never on status (status stays icon+text, per this app's existing non-negotiable accessibility rule).

STORY: A user opens the app and is greeted by name with an immediate, honest read of "how am I doing today" (the ring), sees today's doses as a clear, scannable list color-coded by medication, and can drill into any medication's own colored identity across the rest of the app (list, detail, calendar) without re-reading a label every time.

FIRST VIEWPORT (Today): Greeting header ("Καλημέρα, {name}") in the forest-emerald surface, a horizontal 7-day strip (today emphasized) beneath it, a completion ring + fraction in the header's trailing edge, then the dose list below on the warm off-white ground, each row: colored avatar circle (medication-specific hue) + name + time + status, primary "Έλαβα"-equivalent action reachable per-row, one bottom "Mark all as taken"-equivalent primary action anchored above the tab bar only when doses remain.

FORM: Brief-pinned (user-supplied 22-screen reference image) — no concept-seed roll run; this is the pinned/brief-wins path the skill itself carries for a fully specified reference, not an invented direction. Seed key: n/a (pinned).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
