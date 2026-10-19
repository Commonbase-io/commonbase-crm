import { createClientOrg, listClientOrgs } from "@/lib/platform/orgs";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { orgCreateSchema } from "@/lib/validation";

export const GET = withApi({ platform: true }, async ({ session }) => json(await listClientOrgs(session)));

export const POST = withApi({ platform: true, body: orgCreateSchema }, async ({ session, body }) => {
  return json(await createClientOrg(session, body), 201);
});
