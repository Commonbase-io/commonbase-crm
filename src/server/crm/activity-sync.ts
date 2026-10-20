import "server-only";
import { addEmailSuppressions } from "@/server/compliance/opt-out-sync";
import { withSyncState } from "@/server/jobs/sync-state";
import type { ProviderAdapters } from "@/server/providers/interfaces";
import { createAdminClient } from "@/server/supabase/admin";

// Pulls email events from the tenant's provider into activities. Events are
// idempotent by external_event_id, so overlapping windows never duplicate.
// Bounces also suppress the address. Events for contacts not saved in the
// CRM are skipped (counted, never auto-created).

const FIRST_SYNC_LOOKBACK_DAYS = 30;
const UNIQUE_VIOLATION = "23505";

export interface ActivitySyncResult {
  inserted: number;
  duplicates: number;
  unmatched: number;
  bouncesSuppressed: number;
}

export async function syncEmailActivity(tenantId: string, adapters: ProviderAdapters): Promise<ActivitySyncResult> {
  if (adapters.tenantId !== tenantId) throw new Error("Adapter does not belong to this tenant");
  return withSyncState({ tenantId, connectionId: adapters.connectionId, kind: "email_activity" }, async (lastSuccess) => {
    const db = createAdminClient();
    const since = lastSuccess ?? new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 86_400_000);
    const events = await adapters.outreach.getEmailActivity({ since, limit: 200 });
    const result: ActivitySyncResult = { inserted: 0, duplicates: 0, unmatched: 0, bouncesSuppressed: 0 };
    if (!events.length) return result;

    const contactRefs = [...new Set(events.map((e) => e.externalContactId))];
    const sequenceIds = [...new Set(events.flatMap((e) => (e.sequenceExternalId ? [e.sequenceExternalId] : [])))];
    const eventIds = events.map((e) => e.externalEventId);
    const [contacts, campaigns, existing] = await Promise.all([
      db.from("contacts").select("id, email, external_ref").eq("tenant_id", tenantId).in("external_ref", contactRefs),
      sequenceIds.length
        ? db.from("campaigns").select("id, external_id").eq("tenant_id", tenantId).in("external_id", sequenceIds)
        : Promise.resolve({ data: [], error: null }),
      db.from("activities").select("external_event_id").eq("tenant_id", tenantId).in("external_event_id", eventIds),
    ]);
    if (contacts.error || campaigns.error || existing.error) throw new Error("Failed to load activity mappings");

    const contactByRef = new Map(contacts.data.map((c) => [c.external_ref as string, c]));
    const campaignBySequence = new Map(campaigns.data.map((c) => [c.external_id as string, c.id]));
    const seen = new Set(existing.data.map((a) => a.external_event_id));
    const bounced: string[] = [];

    for (const event of events) {
      const contact = contactByRef.get(event.externalContactId);
      if (!contact) {
        result.unmatched++;
        continue;
      }
      if (seen.has(event.externalEventId)) {
        result.duplicates++;
        continue;
      }
      const { error } = await db.from("activities").insert({
        tenant_id: tenantId,
        contact_id: contact.id,
        campaign_id: event.sequenceExternalId ? (campaignBySequence.get(event.sequenceExternalId) ?? null) : null,
        event_type: event.eventType,
        occurred_at: event.occurredAt,
        external_event_id: event.externalEventId,
      });
      if (error?.code === UNIQUE_VIOLATION) {
        result.duplicates++; // inserted concurrently by another run
        continue;
      }
      if (error) throw new Error("Failed to insert activity");
      seen.add(event.externalEventId);
      result.inserted++;
      if (event.eventType === "email_bounced" && contact.email) bounced.push(contact.email);
    }
    result.bouncesSuppressed = await addEmailSuppressions(tenantId, bounced, "bounce", "Hard bounce");
    return result;
  });
}
