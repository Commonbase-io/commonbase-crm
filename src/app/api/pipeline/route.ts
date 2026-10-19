import { getPipeline } from "@/lib/crm/pipelines";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";

export const GET = withApi({}, async ({ session }) => json(await getPipeline(session)));
