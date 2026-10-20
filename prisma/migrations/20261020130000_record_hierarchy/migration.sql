-- Company is the top tier. A contact cannot exist without one.
-- A deal belongs to a company and at least one contact at that same company.
-- There is no hosted data. Seeded local and CI rows already follow the rules,
-- so the deletes below are a no-op there. Dirty local rows that cannot be
-- repaired are removed so the NOT NULL and foreign keys can be applied.

DELETE FROM "Note" n
USING "Contact" c
WHERE n."contactId" = c.id
  AND c."companyId" IS NULL;

DELETE FROM "DealContact" dc
USING "Contact" c
WHERE dc."contactId" = c.id
  AND c."companyId" IS NULL;

DELETE FROM "Contact" WHERE "companyId" IS NULL;

DELETE FROM "DealContact" dc
USING "Deal" d, "Contact" c
WHERE dc."dealId" = d.id
  AND dc."contactId" = c.id
  AND (d."companyId" IS NULL OR c."companyId" IS DISTINCT FROM d."companyId");

DELETE FROM "Note" n
USING "Deal" d
WHERE n."dealId" = d.id
  AND (
    d."companyId" IS NULL
    OR NOT EXISTS (SELECT 1 FROM "DealContact" dc WHERE dc."dealId" = d.id)
  );

DELETE FROM "Deal" d
WHERE d."companyId" IS NULL
   OR NOT EXISTS (SELECT 1 FROM "DealContact" dc WHERE dc."dealId" = d.id);

ALTER TABLE "Contact" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Deal" ALTER COLUMN "companyId" SET NOT NULL;

CREATE UNIQUE INDEX "Contact_id_orgId_companyId_key" ON "Contact"("id", "orgId", "companyId");
CREATE UNIQUE INDEX "Deal_id_orgId_companyId_key" ON "Deal"("id", "orgId", "companyId");

ALTER TABLE "DealContact" ADD COLUMN "companyId" UUID;

UPDATE "DealContact" dc
SET "companyId" = d."companyId"
FROM "Deal" d
WHERE dc."dealId" = d.id
  AND dc."orgId" = d."orgId";

DELETE FROM "DealContact" WHERE "companyId" IS NULL;

ALTER TABLE "DealContact" ALTER COLUMN "companyId" SET NOT NULL;

ALTER TABLE "DealContact" DROP CONSTRAINT "DealContact_dealId_orgId_fkey";
ALTER TABLE "DealContact" DROP CONSTRAINT "DealContact_contactId_orgId_fkey";

ALTER TABLE "DealContact"
  ADD CONSTRAINT "DealContact_dealId_orgId_companyId_fkey"
  FOREIGN KEY ("dealId", "orgId", "companyId")
  REFERENCES "Deal"("id", "orgId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DealContact"
  ADD CONSTRAINT "DealContact_contactId_orgId_companyId_fkey"
  FOREIGN KEY ("contactId", "orgId", "companyId")
  REFERENCES "Contact"("id", "orgId", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Runs as the invoker, so crm_app stays under RLS. Deferred so a deal and its
-- contact link can be written in one transaction.
CREATE OR REPLACE FUNCTION enforce_deal_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deal uuid;
  v_count integer;
BEGIN
  IF TG_TABLE_NAME = 'Deal' THEN
    v_deal := COALESCE(NEW.id, OLD.id);
  ELSE
    v_deal := COALESCE(NEW."dealId", OLD."dealId");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "Deal" d WHERE d.id = v_deal) THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_count FROM "DealContact" dc WHERE dc."dealId" = v_deal;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'deal_requires_contact' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "DealContact" dc
    JOIN "Deal" d ON d.id = dc."dealId" AND d."orgId" = dc."orgId"
    JOIN "Contact" c ON c.id = dc."contactId" AND c."orgId" = dc."orgId"
    WHERE dc."dealId" = v_deal
      AND (
        c."companyId" IS DISTINCT FROM d."companyId"
        OR dc."companyId" IS DISTINCT FROM d."companyId"
      )
  ) THEN
    RAISE EXCEPTION 'deal_contact_company_mismatch' USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION enforce_deal_hierarchy() OWNER TO crm_owner;
REVOKE ALL ON FUNCTION enforce_deal_hierarchy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enforce_deal_hierarchy() TO crm_app;

CREATE CONSTRAINT TRIGGER deal_hierarchy_on_deal
AFTER INSERT OR UPDATE OF "companyId" ON "Deal"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_deal_hierarchy();

CREATE CONSTRAINT TRIGGER deal_hierarchy_on_link
AFTER INSERT OR UPDATE OR DELETE ON "DealContact"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_deal_hierarchy();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Deal" d
    WHERE NOT EXISTS (SELECT 1 FROM "DealContact" dc WHERE dc."dealId" = d.id)
  ) THEN
    RAISE EXCEPTION 'hierarchy migration left a deal without a contact';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "DealContact" dc
    JOIN "Deal" d ON d.id = dc."dealId"
    JOIN "Contact" c ON c.id = dc."contactId"
    WHERE c."companyId" IS DISTINCT FROM d."companyId"
       OR dc."companyId" IS DISTINCT FROM d."companyId"
       OR c."orgId" IS DISTINCT FROM d."orgId"
  ) THEN
    RAISE EXCEPTION 'hierarchy migration left a deal contact at the wrong company';
  END IF;
END
$$;
