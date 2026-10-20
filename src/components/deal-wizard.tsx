"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { ApiError, api } from "@/lib/api-client";
import { CreateDialog } from "@/components/create-dialog";
import { Field, FormError, useSubmit } from "@/components/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Option = { id: string; name: string };
type ContactOption = { id: string; name: string; companyId: string };
type Step = "company" | "contact" | "details";

type CompanyChoice =
  | { mode: "existing"; id: string; name: string }
  | { mode: "create"; name: string; domain: string; phone: string; city: string };
type ContactChoice =
  | { mode: "existing"; id: string; name: string }
  | { mode: "create"; firstName: string; lastName: string; email: string; title: string };

export function DealWizard({
  owners,
  companies,
  stages,
  contacts,
  initialOwnerId,
  initialCompanyId,
}: {
  owners: Option[];
  companies: Option[];
  stages: Option[];
  contacts: ContactOption[];
  initialOwnerId: string;
  initialCompanyId?: string;
}) {
  const router = useRouter();
  const { fieldErrors, formError, pending, ready, submit } = useSubmit();
  const seeded = companies.find((company) => company.id === initialCompanyId);
  const [company, setCompany] = React.useState<CompanyChoice | undefined>(
    seeded ? { mode: "existing", id: seeded.id, name: seeded.name } : undefined,
  );
  const [contact, setContact] = React.useState<ContactChoice | undefined>();
  const [step, setStep] = React.useState<Step>(seeded ? "contact" : "company");
  const [companyQuery, setCompanyQuery] = React.useState("");
  const [contactQuery, setContactQuery] = React.useState("");
  const [dealName, setDealName] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState("USD");
  const [stageId, setStageId] = React.useState(stages[0]?.id ?? "");
  const [ownerId, setOwnerId] = React.useState(initialOwnerId);
  const [expectedCloseDate, setExpectedCloseDate] = React.useState("");
  const [localError, setLocalError] = React.useState<string | null>(null);

  const companyContacts =
    company?.mode === "existing" ? contacts.filter((item) => item.companyId === company.id) : [];
  const filteredCompanies = companies.filter((item) => item.name.toLowerCase().includes(companyQuery.trim().toLowerCase()));
  const filteredContacts = companyContacts.filter((item) => item.name.toLowerCase().includes(contactQuery.trim().toLowerCase()));

  function pickCompany(next: CompanyChoice) {
    setCompany(next);
    setContact(undefined);
    setStep("contact");
    setLocalError(null);
  }
  function pickContact(next: ContactChoice) {
    setContact(next);
    setStep("details");
    setLocalError(null);
  }

  function jumpToError(error: ApiError) {
    const fields = error.fieldErrors ?? {};
    if (fields.domain || fields.city || fields.companyId) setStep("company");
    else if (fields.email || fields.firstName || fields.lastName || fields.title || fields.contactId) setStep("contact");
  }

  const companyLabel = company?.name ?? "Company";
  const contactLabel =
    contact?.mode === "create" ? `${contact.firstName} ${contact.lastName}`.trim() : contact?.name ?? "Contact";

  return (
    <div className="flex flex-col gap-5" data-testid="deal-wizard">
      <Steps step={step} companyLabel={company ? companyLabel : undefined} contactLabel={contact ? contactLabel : undefined} />
      <FormError message={localError || formError} />

      {step === "company" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Choose a company</h2>
            <CreateDialog
              label="New company"
              title="New company"
              fields={[
                { name: "name", label: "Name", required: true },
                { name: "domain", label: "Domain" },
                { name: "phone", label: "Phone" },
                { name: "city", label: "City" },
              ]}
              onCreate={(values) =>
                pickCompany({
                  mode: "create",
                  name: values.name ?? "",
                  domain: values.domain ?? "",
                  phone: values.phone ?? "",
                  city: values.city ?? "",
                })
              }
            />
          </div>
          {companies.length > 5 ? (
            <Input placeholder="Search companies…" value={companyQuery} onChange={(event) => setCompanyQuery(event.target.value)} />
          ) : null}
          <PickList
            items={filteredCompanies.map((item) => ({ id: item.id, primary: item.name }))}
            onPick={(id) => {
              const found = companies.find((item) => item.id === id);
              if (found) pickCompany({ mode: "existing", id: found.id, name: found.name });
            }}
            empty="No companies yet — create one to start."
          />
          {fieldErrors.companyId || fieldErrors.domain ? (
            <p className="text-sm text-destructive">{fieldErrors.companyId || fieldErrors.domain}</p>
          ) : null}
        </div>
      ) : null}

      {step === "contact" && company ? (
        <div className="flex flex-col gap-3">
          <BackButton onClick={() => setStep("company")} label={`Company: ${companyLabel}`} />
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-medium">Choose a contact</h2>
            <CreateDialog
              label="New contact"
              title={`New contact at ${companyLabel}`}
              fields={[
                { name: "firstName", label: "First name", required: true },
                { name: "lastName", label: "Last name", required: true },
                { name: "email", label: "Email", type: "email" },
                { name: "title", label: "Title" },
              ]}
              onCreate={(values) =>
                pickContact({
                  mode: "create",
                  firstName: values.firstName ?? "",
                  lastName: values.lastName ?? "",
                  email: values.email ?? "",
                  title: values.title ?? "",
                })
              }
            />
          </div>
          {company.mode === "create" ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {companyLabel} is new, so add the first contact.
            </p>
          ) : (
            <>
              {companyContacts.length > 5 ? (
                <Input placeholder="Search contacts…" value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} />
              ) : null}
              <PickList
                items={filteredContacts.map((item) => ({ id: item.id, primary: item.name }))}
                onPick={(id) => {
                  const found = companyContacts.find((item) => item.id === id);
                  if (found) pickContact({ mode: "existing", id: found.id, name: found.name });
                }}
                empty="No contacts at this company yet — create one."
              />
            </>
          )}
          {fieldErrors.contactId || fieldErrors.email ? (
            <p className="text-sm text-destructive">{fieldErrors.contactId || fieldErrors.email}</p>
          ) : null}
        </div>
      ) : null}

      {step === "details" && company && contact ? (
        <div className="flex flex-col gap-4">
          <BackButton onClick={() => setStep("contact")} label={`${companyLabel} · ${contactLabel}`} />
          <h2 className="text-lg font-medium">Deal details</h2>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!dealName.trim() || !amount.trim()) {
                setLocalError("Name and amount are required");
                return;
              }
              setLocalError(null);
              const companyBody =
                company.mode === "existing"
                  ? { mode: "existing" as const, id: company.id }
                  : { mode: "create" as const, name: company.name, domain: company.domain, phone: company.phone, city: company.city };
              const contactBody =
                contact.mode === "existing"
                  ? { mode: "existing" as const, id: contact.id }
                  : {
                      mode: "create" as const,
                      firstName: contact.firstName,
                      lastName: contact.lastName,
                      email: contact.email,
                      title: contact.title,
                    };
              void submit(async () => {
                const created = await api<{ id: string }>("/api/deals/wizard", {
                  method: "POST",
                  body: {
                    company: companyBody,
                    contact: contactBody,
                    deal: { name: dealName, amount, currency, stageId, ownerId, expectedCloseDate },
                  },
                });
                router.push(`/deals/${created.id}`);
                router.refresh();
              }, jumpToError);
            }}
          >
            <Field label="Name" name="dealName" error={fieldErrors.name}>
              <Input id="dealName" value={dealName} onChange={(event) => setDealName(event.target.value)} />
            </Field>
            <Field label="Amount" name="amount" error={fieldErrors.amount}>
              <Input id="amount" value={amount} placeholder="0.00" onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Field label="Currency" name="currency" error={fieldErrors.currency}>
              <Input id="currency" value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value)} />
            </Field>
            <Field label="Stage" name="stageId" error={fieldErrors.stageId}>
              <Select id="stageId" value={stageId} onChange={(event) => setStageId(event.target.value)}>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Owner" name="ownerId" error={fieldErrors.ownerId}>
              <Select id="ownerId" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expected close" name="expectedCloseDate" error={fieldErrors.expectedCloseDate}>
              <Input
                id="expectedCloseDate"
                type="date"
                value={expectedCloseDate}
                onChange={(event) => setExpectedCloseDate(event.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!ready || pending}>
                {pending ? "Saving…" : "Save deal"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Steps({ step, companyLabel, contactLabel }: { step: Step; companyLabel?: string; contactLabel?: string }) {
  const order: Step[] = ["company", "contact", "details"];
  const labels: Record<Step, string> = {
    company: companyLabel ?? "Company",
    contact: contactLabel ?? "Contact",
    details: "Details",
  };
  const activeIdx = order.indexOf(step);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {order.map((item, index) => {
        const done = index < activeIdx;
        const active = index === activeIdx;
        return (
          <React.Fragment key={item}>
            {index > 0 ? <ChevronRight className="size-4 text-muted-foreground" /> : null}
            <li className={active ? "font-medium text-foreground" : done ? "text-foreground" : "text-muted-foreground"}>
              <span className="inline-flex items-center gap-1">
                {done ? <Check className="size-3.5 text-[var(--success)]" /> : null}
                {labels[item]}
              </span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeft className="size-4" /> {label}
    </button>
  );
}

function PickList({
  items,
  onPick,
  empty,
}: {
  items: { id: string; primary: string; secondary?: string }[];
  onPick: (id: string) => void;
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onPick(item.id)}
            className="flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors hover:bg-accent"
          >
            <span className="min-w-0">
              <span className="block font-medium">{item.primary}</span>
              {item.secondary ? <span className="block truncate text-sm text-muted-foreground">{item.secondary}</span> : null}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}
