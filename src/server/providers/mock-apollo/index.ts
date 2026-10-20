import { createHash } from "node:crypto";
import type {
  ActivityFilters,
  ContactInput,
  EmailActivity,
  EnrichedContact,
  EnrollmentInput,
  EnrollmentResult,
  Mailbox,
  OptOut,
  ProspectFilters,
  ProspectPerson,
  ProspectSearchResult,
  ProviderAdapters,
  SequenceInput,
} from "../interfaces";
import type { ProviderCredential } from "../credentials";

// Deterministic stand-in for a tenant's Apollo account. It makes no network
// calls and never sends email. Every id it returns is derived from the
// connection id (and the call's inputs), so:
//   * results are stable across runs and tests,
//   * two tenants get disjoint data, proving per-account isolation,
//   * retried calls with the same idempotency key return the same ids.
// All people, companies, and domains are synthetic (`.example` TLD).

const FIRST = ["Avery", "Blake", "Casey", "Dana", "Emery", "Finley", "Harper", "Jordan", "Kai", "Logan", "Morgan", "Parker", "Quinn", "Reese", "Rowan", "Sage"];
const LAST = ["Alder", "Birch", "Cedar", "Dune", "Ember", "Fern", "Grove", "Heath", "Ivy", "Juniper", "Knoll", "Linden", "Moss", "North", "Oak", "Pine"];
const COMPANY_A = ["Brightline", "Copperfield", "Driftwood", "Evergreen", "Foxglove", "Granite", "Harbor", "Ironwood", "Juniper", "Keystone", "Lakeside", "Meridian"];
const COMPANY_B = ["Partners", "Labs", "Group", "Health", "Software", "Legal", "Capital", "Logistics", "Insurance", "Studios"];
const INDUSTRIES = ["Accounting", "Biotechnology", "Healthcare", "Insurance", "Legal services", "Logistics", "Software", "Financial services"];
const LOCATIONS = ["Springfield, ZZ", "Shelbyville, ZZ", "Capital City, ZZ", "Ogdenville, ZZ", "Riverton, ZZ"];
const TITLES = ["Facilities Manager", "Office Manager", "Director of Operations", "Head of Workplace", "Real Estate Manager", "CFO", "Procurement Manager"];
const TRIGGERS = ["lease_expiration", "relocation", "new_office", "headcount_growth", "funding_round", "merger_acquisition", "facility_consolidation"];

const POOL_SIZE = 60;
const DAY_MS = 86_400_000;

function digest(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function shortId(...parts: string[]): string {
  return digest(...parts).slice(0, 16);
}

/** Small seeded PRNG (mulberry32) so the pool is deterministic per connection. */
function prng(seed: string) {
  let state = Number.parseInt(digest(seed).slice(0, 8), 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)] as T;
}

interface PoolEntry {
  person: ProspectPerson;
  email: string;
  emailStatus: EnrichedContact["emailStatus"];
}

function buildPool(connectionId: string): PoolEntry[] {
  const rand = prng(`pool:${connectionId}`);
  const tag = shortId("tag", connectionId).slice(0, 6);
  const pool: PoolEntry[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const companyName = `${pick(rand, COMPANY_A)} ${pick(rand, COMPANY_B)}`;
    const domain = `${companyName.toLowerCase().replace(/[^a-z]+/g, "-")}-${tag}.example`;
    const first = pick(rand, FIRST);
    const last = pick(rand, LAST);
    const triggerCount = rand() < 0.45 ? 1 + Math.floor(rand() * 2) : 0;
    const triggerEvents = Array.from({ length: triggerCount }, () => ({
      eventType: pick(rand, TRIGGERS),
      eventDate: new Date(Date.UTC(2026, Math.floor(rand() * 12), 1 + Math.floor(rand() * 28))).toISOString().slice(0, 10),
      note: "Synthetic mock signal",
    }));
    const externalId = `mock-person-${shortId(connectionId, String(i))}`;
    pool.push({
      email: `${first}.${last}`.toLowerCase() + `@${domain}`,
      emailStatus: rand() < 0.8 ? "verified" : "unverified",
      person: {
        externalId,
        name: `${first} ${last}`,
        title: pick(rand, TITLES),
        emailAvailable: true,
        company: {
          externalId: `mock-org-${shortId(connectionId, domain)}`,
          name: companyName,
          domain,
          industry: pick(rand, INDUSTRIES),
          location: pick(rand, LOCATIONS),
          employeeCount: 20 + Math.floor(rand() * 980),
          triggerEvents,
        },
      },
    });
  }
  return pool;
}

const includesAny = (value: string | null, needles: string[] | undefined) =>
  !needles?.length || (value !== null && needles.some((n) => value.toLowerCase().includes(n.toLowerCase())));

function matches(entry: PoolEntry, filters: ProspectFilters): boolean {
  const { person } = entry;
  const size = person.company.employeeCount ?? 0;
  return (
    includesAny(person.company.location, filters.locations) &&
    includesAny(person.company.industry, filters.industries) &&
    includesAny(person.title, filters.titles) &&
    (filters.employeeCountMin === undefined || size >= filters.employeeCountMin) &&
    (filters.employeeCountMax === undefined || size <= filters.employeeCountMax) &&
    (!filters.triggerEventTypes?.length ||
      person.company.triggerEvents.some((event) => filters.triggerEventTypes?.includes(event.eventType)))
  );
}

export function createMockApolloAdapters(input: {
  tenantId: string;
  connectionId: string;
  credential: ProviderCredential;
}): ProviderAdapters {
  const { tenantId, connectionId, credential } = input;
  if (credential.kind !== "mock" || credential.connectionId !== connectionId) {
    throw new Error("Mock adapter requires the mock credential for its own connection");
  }
  const pool = buildPool(connectionId);
  const byId = new Map(pool.map((entry) => [entry.person.externalId, entry]));
  const mailboxId = `mock-mbx-${shortId(connectionId, "mailbox")}`;

  // Sequence ids embed the connection id, so one tenant's adapter rejects another's
  // ids and seed data can reference a valid sequence.
  const sequencePrefix = `mock-seq-${connectionId}-`;
  const sequenceIdFor = (key: string) => sequencePrefix + shortId(connectionId, "seq", key);
  const assertOwnSequence = (sequenceId: string) => {
    if (!sequenceId.startsWith(sequencePrefix)) throw new Error("Unknown sequence for this connection");
  };

  return {
    tenantId,
    connectionId,
    mode: "mock",
    prospecting: {
      async searchPeople(filters: ProspectFilters): Promise<ProspectSearchResult> {
        const perPage = Math.min(Math.max(filters.perPage ?? 25, 1), 100);
        const page = Math.max(filters.page ?? 1, 1);
        const hits = pool.filter((entry) => matches(entry, filters));
        return {
          people: hits.slice((page - 1) * perPage, page * perPage).map((entry) => entry.person),
          page,
          perPage,
          total: hits.length,
        };
      },
      async enrichPerson(personId: string): Promise<EnrichedContact> {
        const entry = byId.get(personId);
        if (!entry) throw new Error("Unknown person for this connection");
        return {
          externalId: entry.person.externalId,
          name: entry.person.name,
          title: entry.person.title,
          email: entry.email,
          emailStatus: entry.emailStatus,
        };
      },
      async createContact(contact: ContactInput): Promise<string> {
        return `mock-contact-${shortId(connectionId, contact.email ?? contact.name, contact.companyDomain ?? "")}`;
      },
    },
    outreach: {
      async listMailboxes(): Promise<Mailbox[]> {
        return [{ externalId: mailboxId, email: `outreach-${shortId(connectionId).slice(0, 6)}@mock-mailbox.example`, dailyLimit: 50, status: "active" }];
      },
      async createSequence(sequence: SequenceInput): Promise<string> {
        return sequenceIdFor(sequence.idempotencyKey);
      },
      async enrollContacts(enrollment: EnrollmentInput): Promise<EnrollmentResult> {
        assertOwnSequence(enrollment.sequenceExternalId);
        const result: EnrollmentResult = { enrolled: [], failed: [] };
        for (const contact of enrollment.contacts) {
          // Lets tests exercise partial failure deterministically.
          if (contact.externalContactId.includes("mock-fail")) {
            result.failed.push({ contactId: contact.contactId, reason: "Mock provider rejected contact" });
          } else {
            result.enrolled.push({
              contactId: contact.contactId,
              // Same sequence + contact always yields the same ref, so retries cannot duplicate.
              externalRef: `mock-enr-${shortId(connectionId, enrollment.sequenceExternalId, contact.externalContactId)}`,
            });
          }
        }
        return result;
      },
      async activateSequence(sequenceId: string) {
        assertOwnSequence(sequenceId);
      },
      async pauseSequence(sequenceId: string) {
        assertOwnSequence(sequenceId);
      },
      async getEmailActivity(filters: ActivityFilters): Promise<EmailActivity[]> {
        const limit = Math.min(filters.limit ?? 50, 200);
        const events: EmailActivity[] = [];
        // Every person in the pool gets a send; some reply, fewer reply positively,
        // and a few bounce, so whichever prospects a tenant saves see activity.
        for (let i = 0; i < pool.length && events.length < limit; i++) {
          const entry = pool[i] as PoolEntry;
          const types: EmailActivity["eventType"][] = ["email_sent"];
          if (i % 4 === 0) types.push("email_replied");
          if (i % 8 === 0) types.push("positive_reply");
          if (i % 15 === 7) types.push("email_bounced");
          types.forEach((eventType, j) => {
            events.push({
              // Stable per person and type, so overlapping sync windows dedupe.
              externalEventId: `mock-evt-${shortId(connectionId, String(i), eventType)}`,
              externalContactId: entry.person.externalId,
              sequenceExternalId: null,
              eventType,
              // Shortly after the window opens, never in the future.
              occurredAt: new Date(Math.min(filters.since.getTime() + (j + 1) * 3_600_000, Date.now())).toISOString(),
            });
          });
        }
        return events.slice(0, limit);
      },
      async getOptOuts(since: Date): Promise<OptOut[]> {
        const entry = pool[7] as PoolEntry;
        const occurredAt = new Date(Math.floor(since.getTime() / DAY_MS + 1) * DAY_MS).toISOString();
        return [{ email: entry.email, occurredAt, externalEventId: `mock-optout-${shortId(connectionId, entry.email)}` }];
      },
    },
  };
}
