# Development medication catalog data

This directory holds official EOF (Εθνικός Οργανισμός Φαρμάκων) and Greek
Ministry of Health datasets used to build MedTracking's development-only
internal medication catalog — the backing data for Path A resolution
(`docs/architecture/medication-resolution-architecture.md` §2.5): decoding
a scanned Greek national `280`-prefix EAN-13 barcode to its embedded EOF
product code, then looking that code up here.

## Licensing boundary — read before adding or using anything in this directory

This is confirmed, per direct verification of both `eof.gr/oroi-xrisis/`
and `moh.gov.gr/terms` (architecture doc §2.3/§12 item 7):

| | Status |
|---|---|
| Technical feasibility (barcode → EOF code decode) | **Verified** |
| Official datasets exist (EOF/Ministry price bulletins, reimbursed + OTC tracks) | **Verified** |
| Development inspection, parsing, and local use | **Allowed** |
| Production redistribution / bulk embedding in a shipped app | **NOT yet approved** — `eof.gr`'s and `moh.gov.gr`'s own published terms are directly contradictory; this requires a direct written answer from EOF/Ministry of Health before it's relied on |

Per the project's current scope (MedTracking is a personal gift, not a
published product — see the architecture doc's scope note), that outreach
is not being pursued as active work right now. This directory exists so
development, testing, and the resolution architecture can proceed without
being blocked on it — not because the licensing question has been
resolved in MedTracking's favor.

**Rules while that's unresolved:**

- Downloading, inspecting, parsing, and normalizing official files here: fine, for local development only.
- Committing raw downloaded datasets to git: **never** — see `.gitignore`.
- Publishing the normalized catalog, or any bulk export of it, anywhere public: **never** yet.
- Including this data (raw or normalized) in a shipped Android APK/AAB: **never** yet.
- Exposing a bulk-download API for it: **never** yet.

## Layout

```
data/
├── README.md           tracked in git
├── raw/                 NOT tracked (.gitignore) — official files exactly as downloaded, never edited
│   ├── eof/
│   │   ├── repricing/
│   │   ├── new-products/
│   │   └── generics/
│   └── ministry/
│       └── mysyfa/       the separate OTC/non-prescription price-bulletin track (architecture doc §2.3)
├── normalized/           NOT tracked (.gitignore) — importer output, regenerable from raw/ at any time
└── fixtures/             tracked in git — small, hand-curated test data only, never a full official dataset (spec §35)
```

`raw/` files are never edited after download — if a source changes format, add a new adapter under `my-app/scripts/import/`, don't retrofit the old file.

## Provenance

Every import batch should be recorded as a
`medication_catalog_source_snapshot` row (`lib/db/schema.ts`) — source
organization, dataset type, source URL, published/downloaded timestamps,
filename, SHA-256 checksum, and row count. Never import a file without
recording where it came from.
