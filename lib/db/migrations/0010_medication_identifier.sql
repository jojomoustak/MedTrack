-- Multi-identifier model (GTIN-resolution task spec §1/§5/§12/§19).
-- `medication_catalog_product.eof_code`/`gtin` are unchanged and remain
-- Path A's proven lookup path. This table is strictly additive, for GTIN
-- (and future NHRN/EAN13) mappings, allowing multiple rows per product
-- and — deliberately — multiple products claiming the same identifier
-- value, so a genuine cross-source conflict can be represented as data
-- rather than silently prevented by a uniqueness constraint.
CREATE TABLE "medication_identifier" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "catalog_product_id" uuid NOT NULL REFERENCES "medication_catalog_product"("id"),
  "identifier_type" text NOT NULL,
  "identifier_value" text NOT NULL,
  "source" text NOT NULL,
  "valid_from" date,
  "valid_to" date,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "chk_medication_identifier_type" CHECK ("identifier_type" IN ('EOF_CODE','NHRN','EAN13','GTIN'))
);

CREATE INDEX "ix_medication_identifier_lookup" ON "medication_identifier" ("identifier_type", "identifier_value");
CREATE INDEX "ix_medication_identifier_product" ON "medication_identifier" ("catalog_product_id");
CREATE UNIQUE INDEX "uq_medication_identifier_no_dupe_import" ON "medication_identifier" ("catalog_product_id", "identifier_type", "identifier_value", "source");
