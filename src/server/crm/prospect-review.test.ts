import { describe, expect, it } from "vitest";
import { suppressionHash } from "@/server/compliance/suppression";
import type { ProspectPerson } from "@/server/providers/interfaces";
import { reviewProspects, type ReviewContext } from "./prospect-review";

const person = (id: string, domain: string | null, triggers: string[] = []): ProspectPerson => ({
  externalId: id,
  name: `Person ${id}`,
  title: "Office Manager",
  emailAvailable: true,
  company: {
    externalId: `org-${id}`,
    name: `Company ${id}`,
    domain,
    industry: null,
    location: null,
    employeeCount: 100,
    triggerEvents: triggers.map((eventType) => ({ eventType, eventDate: null, note: null })),
  },
});

const ctx = (overrides: Partial<ReviewContext> = {}): ReviewContext => ({
  customerDomains: new Set(),
  suppressedDomainHashes: new Set(),
  savedDomains: new Set(),
  savedContactRefs: new Set(),
  triggerEventTypes: [],
  prioritizeTriggerEvents: false,
  ...overrides,
});

describe("reviewProspects", () => {
  it("excludes existing customers and suppressed domains, case-insensitively", () => {
    const { prospects, excluded } = reviewProspects(
      [person("1", "Customer.example"), person("2", "blocked.example"), person("3", "fine.example")],
      ctx({ customerDomains: new Set(["customer.example"]), suppressedDomainHashes: new Set([suppressionHash("BLOCKED.example")]) }),
    );
    expect(prospects.map((p) => p.person.externalId)).toEqual(["3"]);
    expect(excluded).toEqual({ customers: 1, suppressed: 1 });
  });

  it("marks saved contacts and companies", () => {
    const { prospects } = reviewProspects(
      [person("1", "a.example"), person("2", "a.example"), person("3", "b.example"), person("4", null)],
      ctx({ savedContactRefs: new Set(["1"]), savedDomains: new Set(["a.example"]) }),
    );
    expect(prospects.map((p) => p.status)).toEqual(["contact_saved", "company_saved", "new", "new"]);
  });

  it("ranks relevant trigger events first when the tenant prioritizes them, keeping provider order otherwise", () => {
    const people = [person("1", "a.example"), person("2", "b.example", ["funding_round"]), person("3", "c.example", ["contract_renewal"]), person("4", "d.example", ["relocation"])];
    const prioritized = reviewProspects(people, ctx({ triggerEventTypes: ["relocation", "funding_round"], prioritizeTriggerEvents: true }));
    expect(prioritized.prospects.map((p) => p.person.externalId)).toEqual(["2", "4", "1", "3"]);
    expect(prioritized.prospects.find((p) => p.person.externalId === "3")?.relevantTriggers).toEqual([]);

    const plain = reviewProspects(people, ctx({ triggerEventTypes: ["relocation"] }));
    expect(plain.prospects.map((p) => p.person.externalId)).toEqual(["1", "2", "3", "4"]);
  });
});
