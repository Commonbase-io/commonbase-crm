import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";

export const GET = withApi({ allowPasswordChange: true }, async ({ session }) => {
  return json({
    id: session.id,
    email: session.email,
    name: session.name,
    role: session.role,
    orgId: session.orgId,
    orgName: session.orgName,
    orgIsPlatform: session.orgIsPlatform,
    isPlatformAdmin: session.isPlatformAdmin,
    mustChangePassword: session.mustChangePassword,
  });
});
