"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Field, FormError, useSubmit } from "@/components/form-state";

type Option = { id: string; name: string };
type Initial = {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  companyId?: string | null;
  notes?: string | null;
  ownerId?: string;
};

export function ContactForm({
  owners,
  companies,
  initial,
}: {
  owners: Option[];
  companies: Option[];
  initial?: Initial;
}) {
  const router = useRouter();
  const { fieldErrors, formError, pending, ready, submit } = useSubmit();
  return (
    <form
      className="form two"
      onSubmit={(event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        void submit(async () => {
          if (initial?.id) {
            await api(`/api/contacts/${initial.id}`, { method: "PATCH", body: data });
            router.push(`/contacts/${initial.id}`);
          } else {
            const created = await api<{ id: string }>("/api/contacts", { method: "POST", body: data });
            router.push(`/contacts/${created.id}`);
          }
          router.refresh();
        });
      }}
    >
      <Field label="First name" name="firstName" error={fieldErrors.firstName}>
        <input id="firstName" name="firstName" defaultValue={initial?.firstName ?? ""} required />
      </Field>
      <Field label="Last name" name="lastName" error={fieldErrors.lastName}>
        <input id="lastName" name="lastName" defaultValue={initial?.lastName ?? ""} required />
      </Field>
      <Field label="Email" name="email" error={fieldErrors.email}>
        <input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} />
      </Field>
      <Field label="Phone" name="phone" error={fieldErrors.phone}>
        <input id="phone" name="phone" defaultValue={initial?.phone ?? ""} />
      </Field>
      <Field label="Title" name="title" error={fieldErrors.title}>
        <input id="title" name="title" defaultValue={initial?.title ?? ""} />
      </Field>
      <Field label="Company" name="companyId" error={fieldErrors.companyId}>
        <select id="companyId" name="companyId" defaultValue={initial?.companyId ?? ""} required>
          <option value="">Choose a company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Owner" name="ownerId" error={fieldErrors.ownerId}>
        <select id="ownerId" name="ownerId" defaultValue={initial?.ownerId ?? owners[0]?.id}>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes" name="notes" error={fieldErrors.notes} wide>
        <textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} />
      </Field>
      <div className="wide">
        <FormError message={formError} />
        <button className="button" type="submit" disabled={!ready || pending}>
          {pending ? "Saving…" : "Save contact"}
        </button>
      </div>
    </form>
  );
}
