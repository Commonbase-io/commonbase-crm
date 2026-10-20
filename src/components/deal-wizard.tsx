"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api-client";
import { Field, FormError, useSubmit } from "@/components/form-state";

type Option = { id: string; name: string };
type ContactOption = { id: string; name: string; companyId: string };

const STEPS = ["Company", "Contact", "Deal"];

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
  const [step, setStep] = useState(initialCompanyId ? 1 : 0);
  const [companyMode, setCompanyMode] = useState<"existing" | "create">(companies.length ? "existing" : "create");
  const [companyId, setCompanyId] = useState(initialCompanyId ?? companies[0]?.id ?? "");
  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [contactMode, setContactMode] = useState<"existing" | "create">("existing");
  const [contactId, setContactId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [dealName, setDealName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const [ownerId, setOwnerId] = useState(initialOwnerId);
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const companyContacts = useMemo(
    () => contacts.filter((contact) => contact.companyId === companyId),
    [contacts, companyId],
  );
  const chosenCompany = companies.find((company) => company.id === companyId);
  const chosenContact = companyContacts.find((contact) => contact.id === contactId);

  function companyReady() {
    if (companyMode === "create") return companyName.trim().length > 0;
    return Boolean(companyId);
  }

  function contactReady() {
    if (companyMode === "create" || contactMode === "create" || companyContacts.length === 0) {
      return firstName.trim().length > 0 && lastName.trim().length > 0;
    }
    return Boolean(contactId);
  }

  function goNext() {
    setLocalError(null);
    if (step === 0 && !companyReady()) {
      setLocalError(companyMode === "create" ? "Name is required" : "Choose a company");
      return;
    }
    if (step === 1 && !contactReady()) {
      setLocalError(companyContacts.length === 0 || contactMode === "create" ? "First and last name are required" : "Choose a contact");
      return;
    }
    if (step === 1 && (companyMode === "create" || companyContacts.length === 0)) {
      setContactMode("create");
    }
    setStep((current) => Math.min(2, current + 1));
  }

  function jumpToError(error: ApiError) {
    const fields = error.fieldErrors ?? {};
    if (fields.email || fields.firstName || fields.lastName || fields.title || fields.contactId) setStep(1);
    else if (fields.domain || fields.companyId || fields.city) setStep(0);
  }

  const creatingContact = companyMode === "create" || contactMode === "create" || companyContacts.length === 0;
  const companyLabel = companyMode === "create" ? companyName || "New company" : chosenCompany?.name ?? "Company";
  const contactLabel = creatingContact ? `${firstName} ${lastName}`.trim() || "New contact" : chosenContact?.name ?? "Contact";

  return (
    <div data-testid="deal-wizard">
      <div className="steps" aria-label="Deal steps">
        {STEPS.map((label, index) => (
          <span key={label} data-state={index === step ? "current" : index < step ? "done" : "upcoming"}>
            <em>{index + 1}</em>
            {label}
          </span>
        ))}
      </div>
      <FormError message={localError || formError} />
      {step === 0 ? (
        <div className="form">
          <div className="choice-list">
            {companies.map((company) => (
              <label className="choice" key={company.id}>
                <input
                  type="radio"
                  name="companyChoice"
                  value={company.id}
                  checked={companyMode === "existing" && companyId === company.id}
                  onChange={() => {
                    setCompanyMode("existing");
                    setCompanyId(company.id);
                    setContactId("");
                  }}
                />
                <span>{company.name}</span>
              </label>
            ))}
            <label className="choice">
              <input
                type="radio"
                name="companyChoice"
                value="create"
                checked={companyMode === "create"}
                onChange={() => setCompanyMode("create")}
              />
              <span>Create a new company</span>
            </label>
          </div>
          {companyMode === "create" ? (
            <div className="form two">
              <Field label="Company name" name="companyName" error={fieldErrors.name}>
                <input id="companyName" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
              </Field>
              <Field label="Domain" name="domain" error={fieldErrors.domain}>
                <input id="domain" value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" />
              </Field>
              <Field label="Phone" name="phone" error={fieldErrors.phone}>
                <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </Field>
              <Field label="City" name="city" error={fieldErrors.city}>
                <input id="city" value={city} onChange={(event) => setCity(event.target.value)} />
              </Field>
            </div>
          ) : null}
          {fieldErrors.companyId ? <em className="field-error">{fieldErrors.companyId}</em> : null}
        </div>
      ) : null}
      {step === 1 ? (
        <div className="form">
          <p className="muted">Contacts at {companyLabel}.</p>
          {companyMode === "existing" && companyContacts.length > 0 ? (
            <div className="choice-list">
              {companyContacts.map((contact) => (
                <label className="choice" key={contact.id}>
                  <input
                    type="radio"
                    name="contactChoice"
                    value={contact.id}
                    checked={contactMode === "existing" && contactId === contact.id}
                    onChange={() => {
                      setContactMode("existing");
                      setContactId(contact.id);
                    }}
                  />
                  <span>{contact.name}</span>
                </label>
              ))}
              <label className="choice">
                <input type="radio" name="contactChoice" value="create" checked={contactMode === "create"} onChange={() => setContactMode("create")} />
                <span>Create a new contact</span>
              </label>
            </div>
          ) : (
            <p className="muted">This company has no contacts yet. Add the first one.</p>
          )}
          {creatingContact ? (
            <div className="form two">
              <Field label="First name" name="firstName" error={fieldErrors.firstName}>
                <input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
              </Field>
              <Field label="Last name" name="lastName" error={fieldErrors.lastName}>
                <input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} />
              </Field>
              <Field label="Email" name="email" error={fieldErrors.email}>
                <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </Field>
              <Field label="Title" name="title" error={fieldErrors.title}>
                <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
              </Field>
            </div>
          ) : null}
          {fieldErrors.contactId ? <em className="field-error">{fieldErrors.contactId}</em> : null}
        </div>
      ) : null}
      {step === 2 ? (
        <div className="form">
          <div className="summary">
            <div>
              <span>Company</span>
              <strong>{companyLabel}</strong>
            </div>
            <div>
              <span>Contact</span>
              <strong>{contactLabel}</strong>
            </div>
          </div>
          <div className="form two">
            <Field label="Name" name="dealName" error={fieldErrors.name}>
              <input id="dealName" value={dealName} onChange={(event) => setDealName(event.target.value)} />
            </Field>
            <Field label="Amount" name="amount" error={fieldErrors.amount}>
              <input id="amount" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Currency" name="currency" error={fieldErrors.currency}>
              <input id="currency" value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value)} />
            </Field>
            <Field label="Stage" name="stageId" error={fieldErrors.stageId}>
              <select id="stageId" value={stageId} onChange={(event) => setStageId(event.target.value)}>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Owner" name="ownerId" error={fieldErrors.ownerId}>
              <select id="ownerId" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Expected close" name="expectedCloseDate" error={fieldErrors.expectedCloseDate}>
              <input id="expectedCloseDate" type="date" value={expectedCloseDate} onChange={(event) => setExpectedCloseDate(event.target.value)} />
            </Field>
          </div>
        </div>
      ) : null}
      <div className="actions">
        {step > 0 ? (
          <button className="button secondary" type="button" onClick={() => setStep((current) => current - 1)}>
            Back
          </button>
        ) : null}
        {step < 2 ? (
          <button className="button" type="button" onClick={goNext}>
            Continue
          </button>
        ) : (
          <button
            className="button"
            type="button"
            disabled={!ready || pending}
            onClick={() => {
              if (!dealName.trim() || !amount.trim()) {
                setLocalError("Name and amount are required");
                return;
              }
              setLocalError(null);
              const company =
                companyMode === "existing"
                  ? { mode: "existing" as const, id: companyId }
                  : { mode: "create" as const, name: companyName, domain, phone, city };
              const contact = creatingContact
                ? { mode: "create" as const, firstName, lastName, email, title }
                : { mode: "existing" as const, id: contactId };
              void submit(async () => {
                const created = await api<{ id: string }>("/api/deals/wizard", {
                  method: "POST",
                  body: {
                    company,
                    contact,
                    deal: { name: dealName, amount, currency, stageId, ownerId, expectedCloseDate },
                  },
                });
                router.push(`/deals/${created.id}`);
                router.refresh();
              }, (error) => jumpToError(error));
            }}
          >
            {pending ? "Saving…" : "Save deal"}
          </button>
        )}
      </div>
    </div>
  );
}
