"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Field, FormError, useSubmit } from "@/components/form-state";

type Option = { id: string; name: string };

export function ContactWizard({
  companies,
  initialCompanyId,
}: {
  companies: Option[];
  initialCompanyId?: string;
}) {
  const router = useRouter();
  const { fieldErrors, formError, pending, ready, submit } = useSubmit();
  const [step, setStep] = useState(initialCompanyId ? 1 : 0);
  const [companyMode, setCompanyMode] = useState<"existing" | "create">(companies.length ? "existing" : "create");
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const chosen = companies.find((company) => company.id === companyId);

  return (
    <div data-testid="contact-wizard">
      <div className="steps" aria-label="Contact steps">
        {["Company", "Contact"].map((label, index) => (
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
                  }}
                />
                <span>{company.name}</span>
              </label>
            ))}
            <label className="choice">
              <input type="radio" name="companyChoice" value="create" checked={companyMode === "create"} onChange={() => setCompanyMode("create")} />
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
              <Field label="Phone" name="companyPhone" error={fieldErrors.phone}>
                <input id="companyPhone" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </Field>
              <Field label="City" name="city" error={fieldErrors.city}>
                <input id="city" value={city} onChange={(event) => setCity(event.target.value)} />
              </Field>
            </div>
          ) : null}
          {fieldErrors.companyId ? <em className="field-error">{fieldErrors.companyId}</em> : null}
        </div>
      ) : (
        <div className="form two">
          <p className="muted wide">At {companyMode === "create" ? companyName || "the new company" : chosen?.name}.</p>
          <Field label="First name" name="firstName" error={fieldErrors.firstName}>
            <input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </Field>
          <Field label="Last name" name="lastName" error={fieldErrors.lastName}>
            <input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </Field>
          <Field label="Email" name="email" error={fieldErrors.email}>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="Phone" name="phone" error={fieldErrors.phone}>
            <input id="phone" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
          </Field>
          <Field label="Title" name="title" error={fieldErrors.title}>
            <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Notes" name="notes" error={fieldErrors.notes} wide>
            <textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
      )}
      <div className="actions">
        {step > 0 ? (
          <button className="button secondary" type="button" onClick={() => setStep(0)}>
            Back
          </button>
        ) : null}
        {step === 0 ? (
          <button
            className="button"
            type="button"
            onClick={() => {
              if (companyMode === "existing" && !companyId) {
                setLocalError("Choose a company");
                return;
              }
              if (companyMode === "create" && !companyName.trim()) {
                setLocalError("Name is required");
                return;
              }
              setLocalError(null);
              setStep(1);
            }}
          >
            Continue
          </button>
        ) : (
          <button
            className="button"
            type="button"
            disabled={!ready || pending}
            onClick={() => {
              if (!firstName.trim() || !lastName.trim()) {
                setLocalError("First and last name are required");
                return;
              }
              setLocalError(null);
              const body =
                companyMode === "existing"
                  ? { firstName, lastName, email, phone: contactPhone, title, notes, companyId }
                  : { firstName, lastName, email, phone: contactPhone, title, notes, company: { name: companyName, domain, phone, city } };
              void submit(async () => {
                const created = await api<{ id: string }>("/api/contacts", { method: "POST", body });
                router.push(`/contacts/${created.id}`);
                router.refresh();
              }, (error) => {
                const fields = error.fieldErrors ?? {};
                if (fields.domain || fields.companyId || fields.city) setStep(0);
              });
            }}
          >
            {pending ? "Saving…" : "Save contact"}
          </button>
        )}
      </div>
    </div>
  );
}
