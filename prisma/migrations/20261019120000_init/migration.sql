-- Schema from Prisma, then prisma/app-role.sql and prisma/rls-bootstrap.sql.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "StageOutcome" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "Org" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isPlatform" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "notes" TEXT,
    "ownerId" UUID NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "companyId" UUID,
    "ownerId" UUID NOT NULL,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "pipelineId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "outcome" "StageOutcome" NOT NULL DEFAULT 'OPEN',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "stageId" UUID NOT NULL,
    "companyId" UUID,
    "ownerId" UUID NOT NULL,
    "expectedCloseDate" DATE,
    "status" "DealStatus" NOT NULL DEFAULT 'OPEN',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealContact" (
    "orgId" UUID NOT NULL,
    "dealId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealContact_pkey" PRIMARY KEY ("dealId","contactId")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" UUID NOT NULL,
    "companyId" UUID,
    "contactId" UUID,
    "dealId" UUID,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "actorId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Org_slug_key" ON "Org"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_orgId_deactivatedAt_idx" ON "User"("orgId", "deactivatedAt");

-- CreateIndex
CREATE INDEX "User_orgId_role_idx" ON "User"("orgId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_orgId_key" ON "User"("id", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "Company_orgId_archivedAt_name_idx" ON "Company"("orgId", "archivedAt", "name");

-- CreateIndex
CREATE INDEX "Company_orgId_domain_idx" ON "Company"("orgId", "domain");

-- CreateIndex
CREATE INDEX "Company_orgId_ownerId_idx" ON "Company"("orgId", "ownerId");

-- CreateIndex
CREATE INDEX "Company_orgId_updatedAt_idx" ON "Company"("orgId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Company_id_orgId_key" ON "Company"("id", "orgId");

-- CreateIndex
CREATE INDEX "Contact_orgId_archivedAt_lastName_firstName_idx" ON "Contact"("orgId", "archivedAt", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Contact_orgId_email_idx" ON "Contact"("orgId", "email");

-- CreateIndex
CREATE INDEX "Contact_orgId_companyId_idx" ON "Contact"("orgId", "companyId");

-- CreateIndex
CREATE INDEX "Contact_orgId_ownerId_idx" ON "Contact"("orgId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_id_orgId_key" ON "Contact"("id", "orgId");

-- CreateIndex
CREATE INDEX "Pipeline_orgId_isDefault_idx" ON "Pipeline"("orgId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_id_orgId_key" ON "Pipeline"("id", "orgId");

-- CreateIndex
CREATE INDEX "Stage_orgId_pipelineId_position_idx" ON "Stage"("orgId", "pipelineId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_id_orgId_key" ON "Stage"("id", "orgId");

-- CreateIndex
CREATE INDEX "Deal_orgId_stageId_archivedAt_idx" ON "Deal"("orgId", "stageId", "archivedAt");

-- CreateIndex
CREATE INDEX "Deal_orgId_ownerId_idx" ON "Deal"("orgId", "ownerId");

-- CreateIndex
CREATE INDEX "Deal_orgId_companyId_idx" ON "Deal"("orgId", "companyId");

-- CreateIndex
CREATE INDEX "Deal_orgId_status_archivedAt_idx" ON "Deal"("orgId", "status", "archivedAt");

-- CreateIndex
CREATE INDEX "Deal_orgId_name_idx" ON "Deal"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_id_orgId_key" ON "Deal"("id", "orgId");

-- CreateIndex
CREATE INDEX "DealContact_orgId_contactId_idx" ON "DealContact"("orgId", "contactId");

-- CreateIndex
CREATE INDEX "Note_orgId_companyId_createdAt_idx" ON "Note"("orgId", "companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_orgId_contactId_createdAt_idx" ON "Note"("orgId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_orgId_dealId_createdAt_idx" ON "Note"("orgId", "dealId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_entityType_entityId_idx" ON "AuditLog"("orgId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_orgId_fkey" FOREIGN KEY ("ownerId", "orgId") REFERENCES "User"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerId_orgId_fkey" FOREIGN KEY ("ownerId", "orgId") REFERENCES "User"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_orgId_fkey" FOREIGN KEY ("companyId", "orgId") REFERENCES "Company"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_pipelineId_orgId_fkey" FOREIGN KEY ("pipelineId", "orgId") REFERENCES "Pipeline"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_stageId_orgId_fkey" FOREIGN KEY ("stageId", "orgId") REFERENCES "Stage"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_companyId_orgId_fkey" FOREIGN KEY ("companyId", "orgId") REFERENCES "Company"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_ownerId_orgId_fkey" FOREIGN KEY ("ownerId", "orgId") REFERENCES "User"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_dealId_orgId_fkey" FOREIGN KEY ("dealId", "orgId") REFERENCES "Deal"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealContact" ADD CONSTRAINT "DealContact_contactId_orgId_fkey" FOREIGN KEY ("contactId", "orgId") REFERENCES "Contact"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_orgId_fkey" FOREIGN KEY ("authorId", "orgId") REFERENCES "User"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_companyId_orgId_fkey" FOREIGN KEY ("companyId", "orgId") REFERENCES "Company"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_contactId_orgId_fkey" FOREIGN KEY ("contactId", "orgId") REFERENCES "Contact"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_dealId_orgId_fkey" FOREIGN KEY ("dealId", "orgId") REFERENCES "Deal"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_orgId_fkey" FOREIGN KEY ("actorId", "orgId") REFERENCES "User"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Local and CI placeholder password. Set only when the role is first created.
-- Production must rotate crm_app with ALTER ROLE outside of git. Re-running this
-- file does not reset an existing password.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_owner') THEN
    CREATE ROLE crm_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_definer') THEN
    CREATE ROLE crm_definer NOLOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD 'crm_app_local_only';
  END IF;
END
$$;

-- Tenant isolation for commonbase-crm.
-- crm_app is subject to FORCE ROW LEVEL SECURITY.
-- Cross-tenant reads go through SECURITY DEFINER functions owned by crm_definer (NOLOGIN, BYPASSRLS).

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO crm_app, crm_definer, crm_owner;

ALTER TABLE "Deal" ADD CONSTRAINT "Deal_amount_nonnegative" CHECK ("amountCents" >= 0);
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_currency_code" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_position_nonnegative" CHECK ("position" >= 0);
ALTER TABLE "Note" ADD CONSTRAINT "Note_one_parent" CHECK (
  (CASE WHEN "companyId" IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN "contactId" IS NOT NULL THEN 1 ELSE 0 END)
  + (CASE WHEN "dealId" IS NOT NULL THEN 1 ELSE 0 END) = 1
);

CREATE UNIQUE INDEX "Company_domain_active_key" ON "Company" ("orgId", "domain") WHERE "domain" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "Contact_email_active_key" ON "Contact" ("orgId", "email") WHERE "email" IS NOT NULL AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "Pipeline_one_default_key" ON "Pipeline" ("orgId") WHERE "isDefault" = true AND "archivedAt" IS NULL;

ALTER TABLE "Org" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "User" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Session" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "LoginAttempt" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Company" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Contact" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Pipeline" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Stage" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Deal" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "Note" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "AuditLog" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "Org" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Company" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Contact" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Pipeline" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Stage" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Deal" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Note" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'Org', 'User', 'Company', 'Contact', 'Pipeline', 'Stage', 'Deal', 'DealContact', 'Note', 'AuditLog', 'Session', 'LoginAttempt'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END
$$;

DROP POLICY IF EXISTS tenant_org ON "Org";
CREATE POLICY tenant_org ON "Org"
  FOR ALL TO crm_app
  USING (id = app_current_org_id())
  WITH CHECK (id = app_current_org_id());

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'User', 'Company', 'Contact', 'Pipeline', 'Stage', 'Deal', 'DealContact', 'Note', 'AuditLog'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL TO crm_app USING ("orgId" = app_current_org_id()) WITH CHECK ("orgId" = app_current_org_id())',
      tbl
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION seed_default_pipeline(p_org uuid) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_pipeline uuid;
BEGIN
  INSERT INTO "Pipeline" (id, "orgId", name, "isDefault", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), p_org, 'Default', true, now(), now())
  RETURNING id INTO v_pipeline;

  INSERT INTO "Stage" (id, "orgId", "pipelineId", name, position, outcome, "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid(), p_org, v_pipeline, 'Lead', 0, 'OPEN', now(), now()),
    (gen_random_uuid(), p_org, v_pipeline, 'Qualified', 1, 'OPEN', now(), now()),
    (gen_random_uuid(), p_org, v_pipeline, 'Proposal', 2, 'OPEN', now(), now()),
    (gen_random_uuid(), p_org, v_pipeline, 'Negotiation', 3, 'OPEN', now(), now()),
    (gen_random_uuid(), p_org, v_pipeline, 'Won', 4, 'WON', now(), now()),
    (gen_random_uuid(), p_org, v_pipeline, 'Lost', 5, 'LOST', now(), now());

  RETURN v_pipeline;
END;
$$;

CREATE OR REPLACE FUNCTION lookup_user_by_email(p_email text)
RETURNS TABLE (
  user_id uuid,
  org_id uuid,
  password_hash text,
  role text,
  is_platform_admin boolean,
  must_change_password boolean,
  deactivated boolean,
  org_is_platform boolean,
  org_name text,
  user_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id, u."orgId", u."passwordHash", u.role::text, u."isPlatformAdmin",
         u."mustChangePassword", u."deactivatedAt" IS NOT NULL, o."isPlatform", o.name, u.name
  FROM "User" u
  JOIN "Org" o ON o.id = u."orgId"
  WHERE lower(u.email) = lower(p_email)
$$;

CREATE OR REPLACE FUNCTION create_session(p_user_id uuid, p_token_hash text, p_expires_at timestamp)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO "Session" (id, "userId", "tokenHash", "expiresAt", "createdAt")
  VALUES (gen_random_uuid(), p_user_id, p_token_hash, p_expires_at, now())
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION lookup_session(p_token_hash text)
RETURNS TABLE (
  user_id uuid,
  org_id uuid,
  email text,
  user_name text,
  role text,
  is_platform_admin boolean,
  must_change_password boolean,
  org_is_platform boolean,
  org_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id, u."orgId", u.email, u.name, u.role::text, u."isPlatformAdmin",
         u."mustChangePassword", o."isPlatform", o.name
  FROM "Session" s
  JOIN "User" u ON u.id = s."userId"
  JOIN "Org" o ON o.id = u."orgId"
  WHERE s."tokenHash" = p_token_hash
    AND s."expiresAt" > now()
    AND u."deactivatedAt" IS NULL
$$;

CREATE OR REPLACE FUNCTION delete_session(p_token_hash text) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM "Session" WHERE "tokenHash" = p_token_hash;
$$;

CREATE OR REPLACE FUNCTION delete_user_sessions(p_user_id uuid) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM "Session" WHERE "userId" = p_user_id;
$$;

CREATE OR REPLACE FUNCTION record_login_attempt(p_email text, p_ip text, p_success boolean) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO "LoginAttempt" (id, email, ip, success, "createdAt")
  VALUES (gen_random_uuid(), lower(p_email), p_ip, p_success, now());
$$;

CREATE OR REPLACE FUNCTION failed_login_count(p_email text, p_window_seconds integer) RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)::integer
  FROM "LoginAttempt"
  WHERE lower(email) = lower(p_email)
    AND success = false
    AND "createdAt" > now() - make_interval(secs => p_window_seconds);
$$;

CREATE OR REPLACE FUNCTION assert_platform_admin() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := app_current_user_id();
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM "User" u
    JOIN "Org" o ON o.id = u."orgId"
    WHERE u.id = v_actor
      AND u."isPlatformAdmin" = true
      AND o."isPlatform" = true
      AND u."deactivatedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION create_client_org(
  p_name text,
  p_slug text,
  p_admin_email text,
  p_admin_name text,
  p_password_hash text
) RETURNS TABLE (org_id uuid, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_org uuid;
  v_user uuid;
BEGIN
  PERFORM assert_platform_admin();

  IF EXISTS (SELECT 1 FROM "User" WHERE lower(email) = lower(p_admin_email)) THEN
    RAISE EXCEPTION 'email_taken' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM "Org" WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'slug_taken' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO "Org" (id, name, slug, "isPlatform", "createdAt", "updatedAt")
  VALUES (gen_random_uuid(), p_name, p_slug, false, now(), now())
  RETURNING id INTO v_org;

  INSERT INTO "User" (
    id, "orgId", email, name, "passwordHash", role, "isPlatformAdmin",
    "mustChangePassword", "createdAt", "updatedAt"
  ) VALUES (
    gen_random_uuid(), v_org, lower(p_admin_email), p_admin_name, p_password_hash,
    'ADMIN', false, true, now(), now()
  )
  RETURNING id INTO v_user;

  PERFORM seed_default_pipeline(v_org);

  INSERT INTO "AuditLog" (id, "orgId", "actorId", action, "entityType", "entityId", metadata, "createdAt")
  VALUES
    (gen_random_uuid(), v_org, v_user, 'CREATE', 'org', v_org, jsonb_build_object('slug', p_slug), now()),
    (gen_random_uuid(), v_org, v_user, 'CREATE', 'user', v_user, jsonb_build_object('role', 'ADMIN'), now());

  RETURN QUERY SELECT v_org, v_user;
END;
$$;

CREATE OR REPLACE FUNCTION list_client_orgs()
RETURNS TABLE (
  org_id uuid,
  name text,
  slug text,
  is_platform boolean,
  created_at timestamp,
  admin_email text,
  admin_name text,
  user_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM assert_platform_admin();
  RETURN QUERY
  SELECT o.id, o.name, o.slug, o."isPlatform", o."createdAt",
    (
      SELECT u.email FROM "User" u
      WHERE u."orgId" = o.id AND u.role = 'ADMIN'
      ORDER BY u."createdAt" ASC
      LIMIT 1
    ),
    (
      SELECT u.name FROM "User" u
      WHERE u."orgId" = o.id AND u.role = 'ADMIN'
      ORDER BY u."createdAt" ASC
      LIMIT 1
    ),
    (SELECT count(*)::integer FROM "User" u WHERE u."orgId" = o.id)
  FROM "Org" o
  ORDER BY o."createdAt" DESC;
END;
$$;

REVOKE ALL ON FUNCTION app_current_org_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_current_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION seed_default_pipeline(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_session(uuid, text, timestamp) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION delete_user_sessions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_login_attempt(text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION failed_login_count(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION assert_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION create_client_org(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION list_client_orgs() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_current_org_id() TO crm_app, crm_definer;
GRANT EXECUTE ON FUNCTION app_current_user_id() TO crm_app, crm_definer;
GRANT EXECUTE ON FUNCTION seed_default_pipeline(uuid) TO crm_definer;
GRANT EXECUTE ON FUNCTION assert_platform_admin() TO crm_definer;
GRANT EXECUTE ON FUNCTION lookup_user_by_email(text) TO crm_app;
GRANT EXECUTE ON FUNCTION create_session(uuid, text, timestamp) TO crm_app;
GRANT EXECUTE ON FUNCTION lookup_session(text) TO crm_app;
GRANT EXECUTE ON FUNCTION delete_session(text) TO crm_app;
GRANT EXECUTE ON FUNCTION delete_user_sessions(uuid) TO crm_app;
GRANT EXECUTE ON FUNCTION record_login_attempt(text, text, boolean) TO crm_app;
GRANT EXECUTE ON FUNCTION failed_login_count(text, integer) TO crm_app;
GRANT EXECUTE ON FUNCTION create_client_org(text, text, text, text, text) TO crm_app;
GRANT EXECUTE ON FUNCTION list_client_orgs() TO crm_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "Org", "User", "Company", "Contact", "Pipeline", "Stage", "Deal", "DealContact", "Note", "AuditLog"
TO crm_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_definer;

ALTER TABLE "Org" OWNER TO crm_owner;
ALTER TABLE "User" OWNER TO crm_owner;
ALTER TABLE "Session" OWNER TO crm_owner;
ALTER TABLE "LoginAttempt" OWNER TO crm_owner;
ALTER TABLE "Company" OWNER TO crm_owner;
ALTER TABLE "Contact" OWNER TO crm_owner;
ALTER TABLE "Pipeline" OWNER TO crm_owner;
ALTER TABLE "Stage" OWNER TO crm_owner;
ALTER TABLE "Deal" OWNER TO crm_owner;
ALTER TABLE "DealContact" OWNER TO crm_owner;
ALTER TABLE "Note" OWNER TO crm_owner;
ALTER TABLE "AuditLog" OWNER TO crm_owner;

ALTER TYPE "Role" OWNER TO crm_owner;
ALTER TYPE "DealStatus" OWNER TO crm_owner;
ALTER TYPE "StageOutcome" OWNER TO crm_owner;
ALTER TYPE "AuditAction" OWNER TO crm_owner;

ALTER FUNCTION app_current_org_id() OWNER TO crm_owner;
ALTER FUNCTION app_current_user_id() OWNER TO crm_owner;
ALTER FUNCTION seed_default_pipeline(uuid) OWNER TO crm_definer;
ALTER FUNCTION lookup_user_by_email(text) OWNER TO crm_definer;
ALTER FUNCTION create_session(uuid, text, timestamp) OWNER TO crm_definer;
ALTER FUNCTION lookup_session(text) OWNER TO crm_definer;
ALTER FUNCTION delete_session(text) OWNER TO crm_definer;
ALTER FUNCTION delete_user_sessions(uuid) OWNER TO crm_definer;
ALTER FUNCTION record_login_attempt(text, text, boolean) OWNER TO crm_definer;
ALTER FUNCTION failed_login_count(text, integer) OWNER TO crm_definer;
ALTER FUNCTION assert_platform_admin() OWNER TO crm_definer;
ALTER FUNCTION create_client_org(text, text, text, text, text) OWNER TO crm_definer;
ALTER FUNCTION list_client_orgs() OWNER TO crm_definer;
