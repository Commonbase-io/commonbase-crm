import { createHash } from "node:crypto";

// Must match app.suppression_hash() in supabase/migrations/..._foundation.sql.

export type SuppressionScope = "email" | "domain";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string | null {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  return at > 0 && at < normalized.length - 1 ? normalized.slice(at + 1) : null;
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export function suppressionHash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

export interface SuppressionSet {
  emails: ReadonlySet<string>;
  domains: ReadonlySet<string>;
}

/** True when the address, or its domain, is suppressed. Missing emails count as suppressed. */
export function isSuppressed(email: string | null | undefined, suppressions: SuppressionSet): boolean {
  if (!email) return true;
  const domain = emailDomain(email);
  if (!domain) return true;
  return suppressions.emails.has(suppressionHash(email)) || suppressions.domains.has(suppressionHash(domain));
}
