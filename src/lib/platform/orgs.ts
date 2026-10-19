import { hashPassword } from "@/lib/auth/password";
import type { SessionUser } from "@/lib/auth/session";
import { assertPlatform } from "@/lib/authz";
import { withOrg } from "@/lib/db";
import type { OrgCreateInput } from "@/lib/validation";

export type ClientOrg = {
  orgId: string;
  name: string;
  slug: string;
  isPlatform: boolean;
  createdAt: string;
  adminEmail: string | null;
  adminName: string | null;
  userCount: number;
};

type OrgRow = {
  org_id: string;
  name: string;
  slug: string;
  is_platform: boolean;
  created_at: Date;
  admin_email: string | null;
  admin_name: string | null;
  user_count: number;
};

function serialize(row: OrgRow): ClientOrg {
  return {
    orgId: row.org_id,
    name: row.name,
    slug: row.slug,
    isPlatform: row.is_platform,
    createdAt: row.created_at.toISOString(),
    adminEmail: row.admin_email,
    adminName: row.admin_name,
    userCount: Number(row.user_count),
  };
}

export async function listClientOrgs(session: SessionUser) {
  assertPlatform(session);
  const rows = await withOrg(session.orgId, session.id, (tx) => tx.$queryRaw<OrgRow[]>`SELECT * FROM list_client_orgs()`);
  return rows.map(serialize);
}

export async function createClientOrg(session: SessionUser, input: OrgCreateInput) {
  assertPlatform(session);
  const passwordHash = await hashPassword(input.password);
  const rows = await withOrg(
    session.orgId,
    session.id,
    (tx) => tx.$queryRaw<Array<{ org_id: string; user_id: string }>>`
      SELECT * FROM create_client_org(${input.name}, ${input.slug}, ${input.adminEmail}, ${input.adminName}, ${passwordHash})
    `,
  );
  return { orgId: rows[0]?.org_id, userId: rows[0]?.user_id };
}
