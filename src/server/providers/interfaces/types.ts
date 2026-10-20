// Provider-neutral domain types. Nothing here is Apollo-specific: provider ids
// travel as opaque `externalId` strings and are stored only on tenant-scoped rows.

export interface ProspectFilters {
  locations?: string[];
  industries?: string[];
  employeeCountMin?: number;
  employeeCountMax?: number;
  titles?: string[];
  triggerEventTypes?: string[];
  page?: number;
  perPage?: number;
}

export interface ProspectCompany {
  externalId: string;
  name: string;
  domain: string | null;
  industry: string | null;
  location: string | null;
  employeeCount: number | null;
  triggerEvents: { eventType: string; eventDate: string | null; note: string | null }[];
}

export interface ProspectPerson {
  externalId: string;
  name: string;
  title: string | null;
  /** Search results never include a verified email; enrichment may add one. */
  emailAvailable: boolean;
  company: ProspectCompany;
}

export interface ProspectSearchResult {
  people: ProspectPerson[];
  page: number;
  perPage: number;
  total: number;
}

export interface EnrichedContact {
  externalId: string;
  name: string;
  title: string | null;
  email: string | null;
  emailStatus: "unverified" | "verified" | "invalid";
}

export interface ContactInput {
  name: string;
  title: string | null;
  email: string | null;
  companyName: string | null;
  companyDomain: string | null;
}

export interface Mailbox {
  externalId: string;
  email: string;
  dailyLimit: number;
  status: "active" | "paused" | "disconnected";
}

export interface SequenceStepInput {
  position: number;
  stepType: "email" | "task";
  delayDays: number;
  subject: string | null;
  body: string;
}

export interface SequenceInput {
  name: string;
  mailboxExternalId: string;
  steps: SequenceStepInput[];
  /** Stable key so a retried create returns the same sequence instead of a duplicate. */
  idempotencyKey: string;
}

export interface EnrollmentInput {
  sequenceExternalId: string;
  mailboxExternalId: string;
  contacts: { contactId: string; externalContactId: string }[];
  idempotencyKey: string;
}

export interface EnrollmentResult {
  enrolled: { contactId: string; externalRef: string }[];
  failed: { contactId: string; reason: string }[];
}

export interface ActivityFilters {
  since: Date;
  cursor?: string | null;
  limit?: number;
}

export type EmailActivityType = "email_sent" | "email_replied" | "positive_reply" | "email_bounced" | "opted_out";

export interface EmailActivity {
  externalEventId: string;
  externalContactId: string;
  sequenceExternalId: string | null;
  eventType: EmailActivityType;
  occurredAt: string;
}

export interface OptOut {
  email: string;
  occurredAt: string;
  externalEventId: string;
}
