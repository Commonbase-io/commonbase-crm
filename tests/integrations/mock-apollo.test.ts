import { describe, expect, it } from "vitest";
import { ProviderCredential } from "@/server/providers/credentials";
import { createMockApolloAdapters } from "@/server/providers/mock-apollo";

const CONN_A = "a0000000-0000-4000-8000-0000000000c1";
const CONN_B = "b0000000-0000-4000-8000-0000000000c1";
const adapters = (tenantId: string, connectionId: string) =>
  createMockApolloAdapters({ tenantId, connectionId, credential: new ProviderCredential(tenantId, connectionId, "mock", "x") });

describe("mock Apollo adapter", () => {
  it("is deterministic per connection", async () => {
    const one = await adapters("t-a", CONN_A).prospecting.searchPeople({ perPage: 10 });
    const two = await adapters("t-a", CONN_A).prospecting.searchPeople({ perPage: 10 });
    expect(one).toEqual(two);
    expect(one.people).toHaveLength(10);
  });

  it("gives different tenants disjoint, synthetic data", async () => {
    const a = await adapters("t-a", CONN_A).prospecting.searchPeople({ perPage: 100 });
    const b = await adapters("t-b", CONN_B).prospecting.searchPeople({ perPage: 100 });
    const idsA = new Set(a.people.map((p) => p.externalId));
    expect(b.people.some((p) => idsA.has(p.externalId))).toBe(false);
    for (const p of [...a.people, ...b.people]) expect(p.company.domain).toMatch(/\.example$/);
  });

  it("filters by title, size, and trigger event", async () => {
    const { prospecting } = adapters("t-a", CONN_A);
    const res = await prospecting.searchPeople({ titles: ["Facilities"], employeeCountMin: 100, triggerEventTypes: ["lease_expiration", "relocation"], perPage: 100 });
    for (const p of res.people) {
      expect(p.title).toContain("Facilities");
      expect(p.company.employeeCount).toBeGreaterThanOrEqual(100);
      expect(p.company.triggerEvents.some((e) => ["lease_expiration", "relocation"].includes(e.eventType))).toBe(true);
    }
    expect(res.total).toBe(res.people.length);
  });

  it("does not expose emails in search results; enrichment adds them", async () => {
    const { prospecting } = adapters("t-a", CONN_A);
    const { people } = await prospecting.searchPeople({ perPage: 1 });
    const person = people[0]!;
    expect(JSON.stringify(person)).not.toContain("@");
    const enriched = await prospecting.enrichPerson(person.externalId);
    expect(enriched.email).toMatch(/@.+\.example$/);
    await expect(adapters("t-b", CONN_B).prospecting.enrichPerson(person.externalId)).rejects.toThrow();
  });

  it("makes sequence creation and enrollment idempotent", async () => {
    const { outreach } = adapters("t-a", CONN_A);
    const input = { name: "n", mailboxExternalId: "m", steps: [], idempotencyKey: "campaign-1-create" };
    const seq = await outreach.createSequence(input);
    expect(await outreach.createSequence(input)).toBe(seq);
    const enroll = { sequenceExternalId: seq, mailboxExternalId: "m", idempotencyKey: "e-12345678", contacts: [{ contactId: "c1", externalContactId: "x1" }, { contactId: "c2", externalContactId: "mock-fail-2" }] };
    const first = await outreach.enrollContacts(enroll);
    const retry = await outreach.enrollContacts(enroll);
    expect(retry).toEqual(first);
    expect(first.enrolled.map((e) => e.contactId)).toEqual(["c1"]);
    expect(first.failed.map((f) => f.contactId)).toEqual(["c2"]);
  });

  it("returns stable activity and opt-out events with unique external ids", async () => {
    const { outreach } = adapters("t-a", CONN_A);
    const since = new Date("2026-10-01T00:00:00Z");
    const events = await outreach.getEmailActivity({ since });
    expect(new Set(events.map((e) => e.externalEventId)).size).toBe(events.length);
    expect(await outreach.getEmailActivity({ since })).toEqual(events);
    const optOuts = await outreach.getOptOuts(since);
    expect(optOuts).toHaveLength(1);
  });

  it("refuses a credential for another connection", () => {
    expect(() =>
      createMockApolloAdapters({ tenantId: "t-a", connectionId: CONN_A, credential: new ProviderCredential("t-b", CONN_B, "mock", "x") }),
    ).toThrow();
  });
});
