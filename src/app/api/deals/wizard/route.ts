import { createDealWizard } from "@/lib/crm/deals";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { dealWizardSchema } from "@/lib/validation";

export const POST = withApi({ body: dealWizardSchema }, async ({ session, body }) => {
  return json(await createDealWizard(session, body), 201);
});
