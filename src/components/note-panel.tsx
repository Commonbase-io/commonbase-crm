"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Field, FormError, useSubmit } from "@/components/form-state";

type Note = { id: string; body: string; createdAt: string; authorName: string };

export function NotePanel({
  notes,
  parent,
}: {
  notes: Note[];
  parent: { companyId?: string; contactId?: string; dealId?: string };
}) {
  const router = useRouter();
  const { fieldErrors, formError, pending, ready, submit } = useSubmit();
  return (
    <section>
      <h2>Notes</h2>
      <div className="related">
        {notes.length === 0 ? <p className="muted">No notes yet.</p> : null}
        {notes.map((note) => (
          <article key={note.id}>
            <p>{note.body}</p>
            <p className="muted">
              {note.authorName} · {new Date(note.createdAt).toLocaleString()}
            </p>
          </article>
        ))}
      </div>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const body = new FormData(form).get("body");
          void submit(async () => {
            await api("/api/notes", { method: "POST", body: { body, ...parent } });
            form.reset();
            router.refresh();
          });
        }}
      >
        <Field label="Add a note" name="body" error={fieldErrors.body}>
          <textarea id="body" name="body" />
        </Field>
        <FormError message={formError} />
        <button className="button" type="submit" disabled={!ready || pending}>
          Add note
        </button>
      </form>
    </section>
  );
}
