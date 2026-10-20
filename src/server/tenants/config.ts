import { z } from "zod";

// Tenant-specific settings (tenants.config). Pilot specifics such as which
// trigger events matter live here and in seed data, never in shared code.

const tenantConfigSchema = z.object({
  industry_label: z.string().optional(),
  trigger_event_types: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,47}$/)).default([]),
  target_titles: z.array(z.string()).default([]),
  prioritize_trigger_events: z.boolean().default(false),
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

/** Unknown or malformed config falls back to defaults rather than breaking pages. */
export function parseTenantConfig(raw: unknown): TenantConfig {
  const parsed = tenantConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : tenantConfigSchema.parse({});
}

export function triggerEventLabel(eventType: string): string {
  const text = eventType.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
