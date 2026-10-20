import { normalizeDomain, suppressionHash } from "@/server/compliance/suppression";
import type { ProspectPerson } from "@/server/providers/interfaces";

// Pure review step between a provider search and the UI: drop people we must
// not contact (existing customers, suppressed domains), mark what is already
// saved, and rank accounts with a relevant trigger event first.

export type ProspectStatus = "new" | "company_saved" | "contact_saved";

export interface ReviewedProspect {
  person: ProspectPerson;
  status: ProspectStatus;
  relevantTriggers: string[];
}

export interface ReviewContext {
  customerDomains: ReadonlySet<string>;
  suppressedDomainHashes: ReadonlySet<string>;
  savedDomains: ReadonlySet<string>;
  savedContactRefs: ReadonlySet<string>;
  /** Trigger event types this tenant cares about (tenants.config). */
  triggerEventTypes: readonly string[];
  prioritizeTriggerEvents: boolean;
}

export interface ReviewResult {
  prospects: ReviewedProspect[];
  excluded: { customers: number; suppressed: number };
}

export function reviewProspects(people: ProspectPerson[], ctx: ReviewContext): ReviewResult {
  const excluded = { customers: 0, suppressed: 0 };
  const prospects: ReviewedProspect[] = [];

  for (const person of people) {
    const domain = person.company.domain ? normalizeDomain(person.company.domain) : null;
    if (domain && ctx.customerDomains.has(domain)) {
      excluded.customers++;
      continue;
    }
    if (domain && ctx.suppressedDomainHashes.has(suppressionHash(domain))) {
      excluded.suppressed++;
      continue;
    }
    const status: ProspectStatus = ctx.savedContactRefs.has(person.externalId)
      ? "contact_saved"
      : domain && ctx.savedDomains.has(domain)
        ? "company_saved"
        : "new";
    const relevantTriggers = [
      ...new Set(
        person.company.triggerEvents
          .map((event) => event.eventType)
          .filter((type) => ctx.triggerEventTypes.length === 0 || ctx.triggerEventTypes.includes(type)),
      ),
    ];
    prospects.push({ person, status, relevantTriggers });
  }

  if (ctx.prioritizeTriggerEvents) {
    // Stable sort: accounts with a relevant trigger event first, provider order otherwise.
    prospects.sort((a, b) => Number(b.relevantTriggers.length > 0) - Number(a.relevantTriggers.length > 0));
  }
  return { prospects, excluded };
}
