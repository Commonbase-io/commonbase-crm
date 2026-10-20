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
  ProspectSearchResult,
  SequenceInput,
} from "./types";

export type * from "./types";

export interface ProspectingProvider {
  searchPeople(filters: ProspectFilters): Promise<ProspectSearchResult>;
  enrichPerson(personId: string): Promise<EnrichedContact>;
  createContact(contact: ContactInput): Promise<string>;
}

export interface OutreachProvider {
  listMailboxes(): Promise<Mailbox[]>;
  createSequence(input: SequenceInput): Promise<string>;
  enrollContacts(input: EnrollmentInput): Promise<EnrollmentResult>;
  activateSequence(sequenceId: string): Promise<void>;
  pauseSequence(sequenceId: string): Promise<void>;
  getEmailActivity(input: ActivityFilters): Promise<EmailActivity[]>;
  getOptOuts(since: Date): Promise<OptOut[]>;
}

/** What the registry hands back: adapters bound to exactly one tenant connection. */
export interface ProviderAdapters {
  tenantId: string;
  connectionId: string;
  mode: "mock" | "live";
  prospecting: ProspectingProvider;
  outreach: OutreachProvider;
}
