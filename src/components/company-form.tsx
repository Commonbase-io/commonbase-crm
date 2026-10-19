"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Field, FormError, useSubmit } from "@/components/form-state";

type Owner = { id: string; name: string };
type Initial = {
  id?: string;
  name?: string;
  domain?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  notes?: string | null;
  ownerId?: string;
};

export function CompanyForm({ owners, initial }: { owners: Owner[]; initial?: Initial }) {
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
            await api(`/api/companies/${initial.id}`, { method: "PATCH", body: data });
            router.push(`/companies/${initial.id}`);
          } else {
            const created = await api<{ id: string }>("/api/companies", { method: "POST", body: data });
            router.push(`/companies/${created.id}`);
          }
          router.refresh();
        });
      }}
    >
      <Field label="Name" name="name" error={fieldErrors.name}>
        <input id="name" name="name" defaultValue={initial?.name ?? ""} required />
      </Field>
      <Field label="Domain" name="domain" error={fieldErrors.domain}>
        <input id="domain" name="domain" defaultValue={initial?.domain ?? ""} placeholder="example.com" />
      </Field>
      <Field label="Phone" name="phone" error={fieldErrors.phone}>
        <input id="phone" name="phone" defaultValue={initial?.phone ?? ""} />
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
      <Field label="Address" name="addressLine1" error={fieldErrors.addressLine1} wide>
        <input id="addressLine1" name="addressLine1" defaultValue={initial?.addressLine1 ?? ""} />
      </Field>
      <Field label="Address line 2" name="addressLine2" error={fieldErrors.addressLine2} wide>
        <input id="addressLine2" name="addressLine2" defaultValue={initial?.addressLine2 ?? ""} />
      </Field>
      <Field label="City" name="city" error={fieldErrors.city}>
        <input id="city" name="city" defaultValue={initial?.city ?? ""} />
      </Field>
      <Field label="Region" name="region" error={fieldErrors.region}>
        <input id="region" name="region" defaultValue={initial?.region ?? ""} />
      </Field>
      <Field label="Postal code" name="postalCode" error={fieldErrors.postalCode}>
        <input id="postalCode" name="postalCode" defaultValue={initial?.postalCode ?? ""} />
      </Field>
      <Field label="Country" name="country" error={fieldErrors.country}>
        <input id="country" name="country" defaultValue={initial?.country ?? ""} />
      </Field>
      <Field label="Notes" name="notes" error={fieldErrors.notes} wide>
        <textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} />
      </Field>
      <div className="wide">
        <FormError message={formError} />
        <button className="button" type="submit" disabled={!ready || pending}>
          {pending ? "Saving…" : "Save company"}
        </button>
      </div>
    </form>
  );
}
