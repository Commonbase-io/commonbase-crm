import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { emailDomain, normalizeDomain, suppressionHash, type SuppressionSet } from "./suppression";

// Loads only the suppression entries relevant to the given emails and domains.
// Never load a tenant's whole suppression list: API reads are capped
// (max_rows), so a full read silently truncates and would miss suppressions.

const CHUNK = 200;

export async function loadSuppressionsFor(
  client: SupabaseClient<Database>,
  tenantId: string,
  input: { emails?: (string | null | undefined)[]; domains?: (string | null | undefined)[] },
): Promise<SuppressionSet> {
  const emails = [...new Set((input.emails ?? []).filter((e): e is string => !!e))];
  const domains = new Set((input.domains ?? []).filter((d): d is string => !!d).map(normalizeDomain));
  for (const email of emails) {
    const domain = emailDomain(email);
    if (domain) domains.add(domain);
  }
  const hashes = [...new Set([...emails.map(suppressionHash), ...[...domains].map(suppressionHash)])];

  const result = { emails: new Set<string>(), domains: new Set<string>() };
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const { data, error } = await client
      .from("suppression_entries")
      .select("scope, value_hash")
      .eq("tenant_id", tenantId)
      .in("value_hash", hashes.slice(i, i + CHUNK));
    if (error) throw new Error("Failed to load suppressions");
    for (const row of data) (row.scope === "domain" ? result.domains : result.emails).add(row.value_hash);
  }
  return result;
}
