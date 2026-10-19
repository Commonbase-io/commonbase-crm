import { createNote, listNotes } from "@/lib/crm/notes";
import { withApi } from "@/lib/api/handler";
import { json } from "@/lib/http";
import { noteSchema } from "@/lib/validation";
import { z } from "zod";

const notesQuery = z.object({
  companyId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
});

export const GET = withApi({ query: notesQuery }, async ({ session, query }) => {
  return json(await listNotes(session, query));
});

export const POST = withApi({ body: noteSchema }, async ({ session, body }) => json(await createNote(session, body), 201));
