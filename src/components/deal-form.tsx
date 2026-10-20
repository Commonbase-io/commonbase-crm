"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { centsToDollars } from "@/lib/money";
import { Field, FormError, useSubmit } from "@/components/form-state";

type Option = { id: string; name: string };
type ContactOption = { id: string; name: string; companyId: string };
type Initial = {
  id?: string;
  name?: string;
  amountCents?: number;
  currency?: string;
  stageId?: string;
  companyId?: string | null;
  ownerId?: string;
  expectedCloseDate?: string | null;
  contactIds?: string[];
};

export function DealForm({
  owners,
  companies,
  stages,
  contacts,
  initial,
}: {
  owners: Option[];
  companies: Option[];
  stages?: Option[];
  contacts: ContactOption[];
  initial?: Initial;
}) {
  const router = useRouter();
  const { fieldErrors, formError, pending, ready, submit } = useSubmit();
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [selected, setSelected] = useState<string[]>(initial?.contactIds ?? []);
  const visible = useMemo(() => contacts.filter((contact) => contact.companyId === companyId), [contacts, companyId]);

  return (
    <form
      className="form two"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body = {
          name: form.get("name"),
          amount: form.get("amount"),
          currency: form.get("currency"),
          stageId: form.get("stageId") || undefined,
          companyId,
          ownerId: form.get("ownerId"),
          expectedCloseDate: form.get("expectedCloseDate"),
          contactIds: selected,
        };
        void submit(async () => {
          if (initial?.id) {
            await api(`/api/deals/${initial.id}`, {
              method: "PATCH",
              body: {
                name: body.name,
                amount: body.amount,
                currency: body.currency,
                companyId: body.companyId,
                ownerId: body.ownerId,
                expectedCloseDate: body.expectedCloseDate,
                contactIds: body.contactIds,
              },
            });
            router.push(`/deals/${initial.id}`);
          } else {
            const created = await api<{ id: string }>("/api/deals", { method: "POST", body });
            router.push(`/deals/${created.id}`);
          }
          router.refresh();
        });
      }}
    >
      <Field label="Name" name="name" error={fieldErrors.name}>
        <input id="name" name="name" defaultValue={initial?.name ?? ""} required />
      </Field>
      <Field label="Amount" name="amount" error={fieldErrors.amount}>
        <input id="amount" name="amount" defaultValue={initial ? centsToDollars(initial.amountCents ?? 0) : ""} placeholder="0.00" required />
      </Field>
      <Field label="Currency" name="currency" error={fieldErrors.currency}>
        <input id="currency" name="currency" defaultValue={initial?.currency ?? "USD"} maxLength={3} />
      </Field>
      {stages ? (
        <Field label="Stage" name="stageId" error={fieldErrors.stageId}>
          <select id="stageId" name="stageId" defaultValue={initial?.stageId ?? stages[0]?.id}>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Company" name="companyId" error={fieldErrors.companyId}>
        <select
          id="companyId"
          value={companyId}
          required
          onChange={(event) => {
            setCompanyId(event.target.value);
            setSelected([]);
          }}
        >
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
      <Field label="Expected close" name="expectedCloseDate" error={fieldErrors.expectedCloseDate}>
        <input id="expectedCloseDate" name="expectedCloseDate" type="date" defaultValue={initial?.expectedCloseDate ?? ""} />
      </Field>
      <div className="field wide">
        <span>Contacts at this company</span>
        {companyId && visible.length === 0 ? (
          <p className="muted">
            No contacts yet. <Link href={`/contacts/new?companyId=${companyId}`}>Add one</Link> before saving this deal.
          </p>
        ) : (
          <div className="choice-list">
            {visible.map((contact) => (
              <label className="choice" key={contact.id}>
                <input
                  type="checkbox"
                  name="contactIds"
                  value={contact.id}
                  checked={selected.includes(contact.id)}
                  onChange={(event) => {
                    setSelected((current) =>
                      event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id),
                    );
                  }}
                />
                <span>{contact.name}</span>
              </label>
            ))}
          </div>
        )}
        {fieldErrors.contactIds ? <em className="field-error">{fieldErrors.contactIds}</em> : null}
      </div>
      <div className="wide">
        <FormError message={formError} />
        <button className="button" type="submit" disabled={!ready || pending}>
          {pending ? "Saving…" : "Save deal"}
        </button>
      </div>
    </form>
  );
}
