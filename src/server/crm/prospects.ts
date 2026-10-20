import "server-only";
import type { TenantContext } from "@/server/auth/tenant-context";
import { assertCan } from "@/server/auth/roles";
import { audit } from "@/server/audit";
import { isSuppressed, normalizeDomain, normalizeEmail } from "@/server/compliance/suppression";
import type { ProspectPerson, ProviderAdapters } from "@/server/providers/interfaces";
import { getProviderRegistry } from "@/server/providers/server-registry";
import { createUserClient } from "@/server/supabase/server";
import { parseTenantConfig, type TenantConfig } from "@/server/tenants/config";
import { toProviderFilters, type ProspectFilterInput } from "./prospect-filters";
import { reviewProspects, type ReviewResult } from "./prospect-review";

type UserClient = Awaited<ReturnType<typeof createUserClient>>;

// Reads and writes run as the signed-in user, so RLS enforces tenancy; every
// query also filters by ctx.tenantId so multi-tenant users stay in the URL's
// tenant. Provider calls go through the per-tenant registry.

export async function loadTenantConfig(ctx: TenantContext, supabase?: UserClient): Promise<TenantConfig> {
  const client = supabase ?? (await createUserClient());
  const { data, error } = await client.from("tenants").select("config").eq("id", ctx.tenantId).single();
  if (error) throw new Error("Failed to load tenant config");
  return parseTenantConfig(data.config);
}

async function loadSuppressions(supabase: UserClient, tenantId: string) {
  const { data, error } = await supabase.from("suppression_entries").select("scope, value_hash").eq("tenant_id", tenantId);
  if (error) throw new Error("Failed to load suppressions");
  return {
    emails: new Set(data.filter((s) => s.scope === "email").map((s) => s.value_hash)),
    domains: new Set(data.filter((s) => s.scope === "domain").map((s) => s.value_hash)),
  };
}

async function buildReviewContext(supabase: UserClient, ctx: TenantContext, people: ProspectPerson[], config: TenantConfig) {
  const domains = [...new Set(people.flatMap((p) => (p.company.domain ? [normalizeDomain(p.company.domain)] : [])))];
  const refs = people.map((p) => p.externalId);
  const [companies, contacts, suppressions] = await Promise.all([
    domains.length
      ? supabase.from("companies").select("domain, is_customer").eq("tenant_id", ctx.tenantId).in("domain", domains)
      : Promise.resolve({ data: [], error: null }),
    refs.length
      ? supabase.from("contacts").select("external_ref").eq("tenant_id", ctx.tenantId).in("external_ref", refs)
      : Promise.resolve({ data: [], error: null }),
    loadSuppressions(supabase, ctx.tenantId),
  ]);
  if (companies.error || contacts.error) throw new Error("Failed to load existing records");
  return {
    customerDomains: new Set(companies.data.filter((c) => c.is_customer && c.domain).map((c) => c.domain as string)),
    savedDomains: new Set(companies.data.flatMap((c) => (c.domain ? [c.domain] : []))),
    savedContactRefs: new Set(contacts.data.flatMap((c) => (c.external_ref ? [c.external_ref] : []))),
    suppressedDomainHashes: suppressions.domains,
    triggerEventTypes: config.trigger_event_types,
    prioritizeTriggerEvents: config.prioritize_trigger_events,
  };
}

export interface ProspectSearch extends ReviewResult {
  total: number;
  mode: ProviderAdapters["mode"];
}

export async function searchProspects(ctx: TenantContext, filters: ProspectFilterInput): Promise<ProspectSearch> {
  assertCan(ctx.role, "prospects.search");
  const adapters = await getProviderRegistry().forTenant(ctx);
  const result = await adapters.prospecting.searchPeople(toProviderFilters(filters));
  const supabase = await createUserClient();
  const config = await loadTenantConfig(ctx, supabase);
  const review = reviewProspects(result.people, await buildReviewContext(supabase, ctx, result.people, config));
  return { ...review, total: result.total, mode: adapters.mode };
}

export interface SaveSummary {
  companiesCreated: number;
  contactsCreated: number;
  alreadySaved: number;
  skippedSuppressed: number;
  skippedCustomers: number;
  notFound: number;
}

const UNIQUE_VIOLATION = "23505";
const TRIGGER_SOURCE = "prospect_search";

async function findOrCreateCompany(supabase: UserClient, ctx: TenantContext, person: ProspectPerson): Promise<{ id: string; created: boolean }> {
  const company = person.company;
  const domain = company.domain ? normalizeDomain(company.domain) : null;
  const existing = async () => {
    const query = supabase.from("companies").select("id").eq("tenant_id", ctx.tenantId);
    const { data } = domain
      ? await query.eq("domain", domain).maybeSingle()
      : await query.eq("external_ref", company.externalId).maybeSingle();
    return data?.id ?? null;
  };
  const found = await existing();
  if (found) return { id: found, created: false };

  const { data, error } = await supabase
    .from("companies")
    .insert({
      tenant_id: ctx.tenantId,
      name: company.name,
      domain,
      industry: company.industry,
      location: company.location,
      employee_count: company.employeeCount,
      source: "prospect_search",
      external_ref: company.externalId,
    })
    .select("id")
    .single();
  if (error?.code === UNIQUE_VIOLATION) {
    // Saved concurrently by someone else: use theirs.
    const raced = await existing();
    if (raced) return { id: raced, created: false };
  }
  if (error || !data) throw new Error("Failed to save company");
  return { id: data.id, created: true };
}

async function addTriggerEvents(supabase: UserClient, ctx: TenantContext, companyId: string, person: ProspectPerson) {
  const events = person.company.triggerEvents;
  if (!events.length) return;
  const { data: existing, error } = await supabase
    .from("company_trigger_events")
    .select("event_type, event_date")
    .eq("tenant_id", ctx.tenantId)
    .eq("company_id", companyId);
  if (error) throw new Error("Failed to load trigger events");
  const seen = new Set(existing.map((e) => `${e.event_type}|${e.event_date ?? ""}`));
  const fresh = events.filter((e) => !seen.has(`${e.eventType}|${e.eventDate ?? ""}`));
  if (!fresh.length) return;
  const { error: insertError } = await supabase.from("company_trigger_events").insert(
    fresh.map((e) => ({
      tenant_id: ctx.tenantId,
      company_id: companyId,
      event_type: e.eventType,
      event_date: e.eventDate,
      source: TRIGGER_SOURCE,
      notes: e.note,
    })),
  );
  if (insertError) throw new Error("Failed to save trigger events");
}



/**
 * Saves selected people from a search. The server repeats the search with the
 * submitted filters and only saves ids that come back, so it never trusts
 * person data posted by the browser.
 */
export async function saveProspects(
  ctx: TenantContext,
  input: { filters: ProspectFilterInput; personIds: string[]; enrich: boolean },
): Promise<SaveSummary> {
  assertCan(ctx.role, "crm.write");
  if (input.enrich) assertCan(ctx.role, "prospects.enrich");

  const adapters = await getProviderRegistry().forTenant(ctx);
  const supabase = await createUserClient();
  const config = await loadTenantConfig(ctx, supabase);
  const result = await adapters.prospecting.searchPeople(toProviderFilters(input.filters));
  const wanted = new Set(input.personIds);
  const selected = result.people.filter((p) => wanted.has(p.externalId));
  const review = reviewProspects(selected, await buildReviewContext(supabase, ctx, selected, config));
  const suppressions = await loadSuppressions(supabase, ctx.tenantId);

  const summary: SaveSummary = {
    companiesCreated: 0,
    contactsCreated: 0,
    alreadySaved: 0,
    skippedSuppressed: review.excluded.suppressed,
    skippedCustomers: review.excluded.customers,
    notFound: wanted.size - selected.length,
  };

  for (const { person, status } of review.prospects) {
    if (status === "contact_saved") {
      summary.alreadySaved++;
      continue;
    }

    let email: string | null = null;
    let emailStatus: "unverified" | "verified" | "invalid" = "unverified";
    if (input.enrich) {
      const enriched = await adapters.prospecting.enrichPerson(person.externalId);
      if (enriched.email && isSuppressed(enriched.email, suppressions)) {
        summary.skippedSuppressed++;
        continue;
      }
      email = enriched.email ? normalizeEmail(enriched.email) : null;
      emailStatus = enriched.emailStatus;
    }

    const company = await findOrCreateCompany(supabase, ctx, person);
    if (company.created) summary.companiesCreated++;
    await addTriggerEvents(supabase, ctx, company.id, person);

    const { error } = await supabase.from("contacts").insert({
      tenant_id: ctx.tenantId,
      company_id: company.id,
      name: person.name,
      title: person.title,
      email,
      email_status: emailStatus,
      external_ref: person.externalId,
      enrichment_status: input.enrich ? (email ? "enriched" : "failed") : "not_requested",
      source: "prospect_search",
    });
    if (error?.code === UNIQUE_VIOLATION) {
      // Same provider id or same email already saved.
      summary.alreadySaved++;
      continue;
    }
    if (error) throw new Error("Failed to save contact");
    summary.contactsCreated++;
  }

  await audit(ctx, "prospects.saved", { ...summary, enrich: input.enrich, mode: adapters.mode });
  return summary;
}
