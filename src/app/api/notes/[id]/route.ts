import { archiveNote } from "@/lib/crm/notes";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";

export const DELETE = withApi({}, async ({ session, params }) => json(await archiveNote(session, params.id)));
