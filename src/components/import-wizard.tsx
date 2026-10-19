"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { parseCsv, suggestMapping } from "@/lib/csv";
import { COMPANY_ALIASES, CONTACT_ALIASES, type ImportRow } from "@/lib/import-shared";
import { FormError, useSubmit } from "@/components/form-state";

const FIELDS = {
  companies: [
    ["name", "Name"],
    ["domain", "Domain"],
    ["phone", "Phone"],
    ["addressLine1", "Address"],
    ["addressLine2", "Address 2"],
    ["city", "City"],
    ["region", "Region"],
    ["postalCode", "Postal code"],
    ["country", "Country"],
    ["notes", "Notes"],
  ],
  contacts: [
    ["firstName", "First name"],
    ["lastName", "Last name"],
    ["email", "Email"],
    ["phone", "Phone"],
    ["title", "Title"],
    ["companyDomain", "Company domain"],
    ["notes", "Notes"],
  ],
} as const;

type Kind = keyof typeof FIELDS;
type Preview = { headers: string[]; rows: ImportRow[]; error: string | null; created?: number };

export function ImportWizard() {
  const [kind, setKind] = useState<Kind>("companies");
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const { formError, pending, ready, submit } = useSubmit();
  const headers = useMemo(() => (csv ? parseCsv(csv).headers : []), [csv]);
  const aliases = kind === "companies" ? COMPANY_ALIASES : CONTACT_ALIASES;

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsv(text);
      setMapping(suggestMapping(parseCsv(text).headers, aliases));
      setPreview(null);
    };
    reader.readAsText(file);
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="row">
        <button className={kind === "companies" ? "button" : "button secondary"} type="button" onClick={() => { setKind("companies"); setPreview(null); }}>
          Companies
        </button>
        <button className={kind === "contacts" ? "button" : "button secondary"} type="button" onClick={() => { setKind("contacts"); setPreview(null); }}>
          Contacts
        </button>
      </div>
      <label className="field">
        <span>CSV file</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) loadFile(file);
          }}
        />
      </label>
      {headers.length > 0 ? (
        <div className="form" style={{ marginTop: 16 }}>
          <h2>Map columns</h2>
          {headers.map((header) => (
            <label key={header} className="field">
              <span>{header}</span>
              <select
                aria-label={`Map ${header}`}
                value={mapping[header] ?? ""}
                onChange={(event) => setMapping((current) => ({ ...current, [header]: event.target.value }))}
              >
                <option value="">Ignore</option>
                {FIELDS[kind].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            className="button secondary"
            type="button"
            disabled={!ready || pending}
            onClick={() => {
              void submit(async () => {
                const result = await api<Preview>(`/api/import/${kind}/preview`, { method: "POST", body: { csv, mapping } });
                setPreview(result);
              });
            }}
          >
            Preview
          </button>
        </div>
      ) : null}
      {preview ? (
        <div data-testid="import-preview">
          <h2>Preview</h2>
          {preview.error ? <p className="form-error">{preview.error}</p> : null}
          <div className="table-wrap">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className={row.status === "invalid" ? "bad" : row.status === "duplicate" ? "dup" : undefined}>{row.rowNumber}</td>
                    <td>{row.status}</td>
                    <td>
                      {[
                        row.errors.join("; "),
                        Object.entries(row.values)
                          .filter(([, value]) => value)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join(" · "),
                      ]
                        .filter(Boolean)
                        .join(" — ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {preview.rows.filter((row) => row.status === "valid").length} ready · {preview.rows.filter((row) => row.status === "invalid").length} invalid ·{" "}
            {preview.rows.filter((row) => row.status === "duplicate").length} duplicates
          </p>
          <button
            className="button"
            type="button"
            disabled={!ready || pending || preview.rows.every((row) => row.status !== "valid")}
            onClick={() => {
              void submit(async () => {
                const result = await api<Preview>(`/api/import/${kind}`, { method: "POST", body: { csv, mapping } });
                setPreview(result);
              });
            }}
          >
            {pending ? "Importing…" : "Import valid rows"}
          </button>
          {preview.created !== undefined ? <p>{preview.created} imported.</p> : null}
        </div>
      ) : null}
      <FormError message={formError} />
    </div>
  );
}
