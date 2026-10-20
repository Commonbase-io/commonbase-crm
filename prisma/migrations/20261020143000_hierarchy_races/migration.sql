-- Closes archive races the application check can lose.
-- Does not delete or rewrite rows. If a local database already violates the
-- rules below, this migration aborts and rolls back.
-- Both functions run as the invoker. crm_owner is NOLOGIN and does not bypass RLS.

CREATE OR REPLACE FUNCTION enforce_deal_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deal uuid;
  v_org uuid;
  v_deals uuid[];
  v_open boolean;
  v_count integer;
  v_active integer;
BEGIN
  IF TG_TABLE_NAME = 'Contact' THEN
    IF TG_OP <> 'UPDATE' OR NEW."archivedAt" IS NULL OR OLD."archivedAt" IS NOT NULL THEN
      RETURN NULL;
    END IF;
    v_org := NEW."orgId";
    SELECT coalesce(array_agg(dc."dealId"), ARRAY[]::uuid[]) INTO v_deals
    FROM "DealContact" dc
    WHERE dc."contactId" = NEW.id
      AND dc."orgId" = v_org;
  ELSIF TG_TABLE_NAME = 'Deal' THEN
    v_org := COALESCE(NEW."orgId", OLD."orgId");
    v_deals := ARRAY[COALESCE(NEW.id, OLD.id)];
  ELSE
    v_org := COALESCE(NEW."orgId", OLD."orgId");
    v_deals := ARRAY[COALESCE(NEW."dealId", OLD."dealId")];
  END IF;

  FOREACH v_deal IN ARRAY v_deals LOOP
    SELECT d."archivedAt" IS NULL INTO v_open
    FROM "Deal" d
    WHERE d.id = v_deal AND d."orgId" = v_org;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT count(*)::integer INTO v_count
    FROM "DealContact" dc
    WHERE dc."dealId" = v_deal AND dc."orgId" = v_org;

    -- Every deal, including an archived one, keeps at least one contact.
    IF v_count < 1 THEN
      RAISE EXCEPTION 'deal_requires_contact' USING ERRCODE = '23514';
    END IF;

    -- An open deal may keep several archived contacts. It may not be left
    -- with a single archived contact: that state is not reachable one step
    -- at a time, and the archive-versus-create race would produce it.
    IF v_open AND v_count = 1 THEN
      SELECT count(*)::integer INTO v_active
      FROM "DealContact" dc
      JOIN "Contact" c ON c.id = dc."contactId" AND c."orgId" = dc."orgId"
      WHERE dc."dealId" = v_deal
        AND dc."orgId" = v_org
        AND c."archivedAt" IS NULL;
      IF v_active < 1 THEN
        IF TG_TABLE_NAME = 'Contact' THEN
          RAISE EXCEPTION 'contact_sole_on_deal' USING ERRCODE = '23514';
        ELSE
          RAISE EXCEPTION 'deal_contact_archived' USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "DealContact" dc
      JOIN "Deal" d ON d.id = dc."dealId" AND d."orgId" = dc."orgId"
      JOIN "Contact" c ON c.id = dc."contactId" AND c."orgId" = dc."orgId"
      WHERE dc."dealId" = v_deal
        AND dc."orgId" = v_org
        AND (
          c."companyId" IS DISTINCT FROM d."companyId"
          OR dc."companyId" IS DISTINCT FROM d."companyId"
        )
    ) THEN
      RAISE EXCEPTION 'deal_contact_company_mismatch' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

ALTER FUNCTION enforce_deal_hierarchy() OWNER TO crm_owner;
REVOKE ALL ON FUNCTION enforce_deal_hierarchy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enforce_deal_hierarchy() TO crm_app;

CREATE CONSTRAINT TRIGGER deal_hierarchy_on_contact
AFTER UPDATE OF "archivedAt" ON "Contact"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_deal_hierarchy();

CREATE OR REPLACE FUNCTION enforce_company_archive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_company uuid;
  v_org uuid;
BEGIN
  IF TG_TABLE_NAME = 'Company' THEN
    IF NEW."archivedAt" IS NULL THEN
      RETURN NULL;
    END IF;
    v_company := NEW.id;
    v_org := NEW."orgId";
    IF EXISTS (
      SELECT 1 FROM "Contact" ct
      WHERE ct."companyId" = v_company AND ct."orgId" = v_org AND ct."archivedAt" IS NULL
    ) OR EXISTS (
      SELECT 1 FROM "Deal" d
      WHERE d."companyId" = v_company AND d."orgId" = v_org AND d."archivedAt" IS NULL
    ) THEN
      RAISE EXCEPTION 'company_has_active_records' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;

  IF TG_TABLE_NAME = 'Deal' THEN
    IF NEW."archivedAt" IS NOT NULL THEN
      RETURN NULL;
    END IF;
    v_company := NEW."companyId";
    v_org := NEW."orgId";
  ELSIF TG_TABLE_NAME = 'Contact' THEN
    IF NEW."archivedAt" IS NOT NULL THEN
      RETURN NULL;
    END IF;
    v_company := NEW."companyId";
    v_org := NEW."orgId";
  ELSE
    RETURN NULL;
  END IF;

  IF v_company IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Company" c
    WHERE c.id = v_company AND c."orgId" = v_org AND c."archivedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'company_archived' USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION enforce_company_archive() OWNER TO crm_owner;
REVOKE ALL ON FUNCTION enforce_company_archive() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enforce_company_archive() TO crm_app;

CREATE CONSTRAINT TRIGGER company_archive_on_company
AFTER UPDATE OF "archivedAt" ON "Company"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_company_archive();

CREATE CONSTRAINT TRIGGER company_archive_on_deal
AFTER INSERT OR UPDATE OF "companyId", "archivedAt" ON "Deal"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_company_archive();

CREATE CONSTRAINT TRIGGER company_archive_on_contact
AFTER INSERT OR UPDATE OF "companyId", "archivedAt" ON "Contact"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_company_archive();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Deal" d
    WHERE d."archivedAt" IS NULL
      AND (SELECT count(*) FROM "DealContact" dc WHERE dc."dealId" = d.id AND dc."orgId" = d."orgId") = 1
      AND NOT EXISTS (
        SELECT 1
        FROM "DealContact" dc
        JOIN "Contact" c ON c.id = dc."contactId" AND c."orgId" = dc."orgId"
        WHERE dc."dealId" = d.id AND dc."orgId" = d."orgId" AND c."archivedAt" IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'open deal has a single archived contact';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Company" co
    WHERE co."archivedAt" IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM "Contact" ct
          WHERE ct."companyId" = co.id AND ct."orgId" = co."orgId" AND ct."archivedAt" IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM "Deal" d
          WHERE d."companyId" = co.id AND d."orgId" = co."orgId" AND d."archivedAt" IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'archived company still has active records';
  END IF;
END
$$;
