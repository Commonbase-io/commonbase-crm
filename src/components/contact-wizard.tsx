"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { ApiError, api } from "@/lib/api-client";
import { CreateDialog } from "@/components/create-dialog";
import { Field, FormError, useSubmit } from "@/components/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Company = { id: string; name: string };
type Step = "company" | "contact";
type CompanyChoice =
  | { mode: "existing"; id: string; name: string }
  | { mode: "create"; name: string; domain: string; phone: string; city: string };

export function ContactWizard({ companies, initialCompanyId }: { companies: Company[]; initialCompanyId?: string }) {
  const router = useRouter();
  const { fieldErrors, formError, pending, ready, submit } = useSubmit();
  const seeded = companies.find((company) => company.id === initialCompanyId);
  const [company, setCompany] = React.useState<CompanyChoice | undefined>(
    seeded ? { mode: "existing", id: seeded.id, name: seeded.name } : undefined,
  );
  const [step, setStep] = React.useState<Step>(seeded ? "contact" : "company");
  const [query, setQuery] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [localError, setLocalError] = React.useState<string | null>(null);

  const filtered = companies.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));
  const companyLabel = company?.name ?? "Company";

  function jumpToError(error: ApiError) {
    const fields = error.fieldErrors ?? {};
    if (fields.domain || fields.city || fields.companyId || fields.name) setStep("company");
  }

  return (
    <div className="flex flex-col gap-5" data-testid="contact-wizard">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        <li className={step === "company" ? "font-medium text-foreground" : "text-foreground"}>
          <span className="inline-flex items-center gap-1">
            {step === "contact" ? <Check className="size-3.5 text-[var(--success)]" /> : null}
            {company ? companyLabel : "Company"}
          </span>
        </li>
        <ChevronRight className="size-4 text-muted-foreground" />
        <li className={step === "contact" ? "font-medium text-foreground" : "text-muted-foreground"}>Contact</li>
      </ol>
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
              onCreate={(values) => {
                setCompany({
                  mode: "create",
                  name: values.name ?? "",
                  domain: values.domain ?? "",
                  phone: values.phone ?? "",
                  city: values.city ?? "",
                });
                setStep("contact");
                setLocalError(null);
              }}
            />
          </div>
          {companies.length > 5 ? (
            <Input placeholder="Search companies…" value={query} onChange={(event) => setQuery(event.target.value)} />
          ) : null}
          {filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No companies yet — create one to start.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCompany({ mode: "existing", id: item.id, name: item.name });
                      setStep("contact");
                      setLocalError(null);
                    }}
                    className="flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors hover:bg-accent"
                  >
                    <span className="font-medium">{item.name}</span>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fieldErrors.companyId || fieldErrors.domain ? (
            <p className="text-sm text-destructive">{fieldErrors.companyId || fieldErrors.domain}</p>
          ) : null}
        </div>
      ) : null}

      {step === "contact" && company ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!firstName.trim() || !lastName.trim()) {
              setLocalError("First and last name are required");
              return;
            }
            setLocalError(null);
            const body =
              company.mode === "existing"
                ? { companyId: company.id, firstName, lastName, email, phone, title, notes }
                : {
                    company: { name: company.name, domain: company.domain, phone: company.phone, city: company.city },
                    firstName,
                    lastName,
                    email,
                    phone,
                    title,
                    notes,
                  };
            void submit(async () => {
              const created = await api<{ id: string }>("/api/contacts", { method: "POST", body });
              router.push(`/contacts/${created.id}`);
              router.refresh();
            }, jumpToError);
          }}
        >
          <button
            type="button"
            onClick={() => setStep("company")}
            className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> Company: {companyLabel}
          </button>
          <h2 className="text-lg font-medium">Contact details</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" name="firstName" error={fieldErrors.firstName}>
              <Input id="firstName" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </Field>
            <Field label="Last name" name="lastName" error={fieldErrors.lastName}>
              <Input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </Field>
            <Field label="Email" name="email" error={fieldErrors.email}>
              <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="Phone" name="phone" error={fieldErrors.phone}>
              <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </Field>
            <Field label="Title" name="title" error={fieldErrors.title}>
              <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes" name="notes" error={fieldErrors.notes}>
                <Textarea id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </Field>
            </div>
          </div>
          <Button type="submit" disabled={!ready || pending}>
            {pending ? "Saving…" : "Save contact"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
