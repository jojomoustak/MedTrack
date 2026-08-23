-- Path A resolution (medication-resolution-architecture.md §2.5): a Greek
-- national `280`-prefix EAN-13 barcode decodes deterministically (offline,
-- no external API) to a 9-digit EOF product code. This is distinct from
-- `gtin` — a Greek national barcode is not a globally-resolvable GTIN
-- (architecture doc §2.1) — so it gets its own column, never derived from
-- `gtin` at query time.
ALTER TABLE "medication_catalog_product" ADD COLUMN "eof_code" text;

CREATE UNIQUE INDEX "uq_catalog_eof_code" ON "medication_catalog_product" ("eof_code") WHERE "eof_code" IS NOT NULL;

-- Import-batch provenance for development-only catalog ingestion
-- (architecture doc §13/§30): which official file a batch of catalog rows
-- came from, not a duplicate of the per-row `source*` columns already on
-- `medication_catalog_product` above.
CREATE TABLE "medication_catalog_source_snapshot" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_organization" text NOT NULL,
  "dataset_type" text NOT NULL,
  "source_url" text NOT NULL,
  "published_at" date,
  "downloaded_at" timestamptz NOT NULL DEFAULT now(),
  "filename" text NOT NULL,
  "checksum_sha256" text NOT NULL,
  "import_version" text NOT NULL,
  "record_count" integer,
  "status" text NOT NULL DEFAULT 'downloaded',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_snapshot_source_organization" CHECK ("source_organization" IN ('EOF','MINISTRY_OF_HEALTH')),
  CONSTRAINT "chk_snapshot_dataset_type" CHECK ("dataset_type" IN ('REIMBURSED_PRICE_BULLETIN','MYSYFA_PRICE_BULLETIN','NEW_PRODUCTS','GENERICS','OTHER')),
  CONSTRAINT "chk_snapshot_status" CHECK ("status" IN ('downloaded','parsed','imported','rejected'))
);
