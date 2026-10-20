"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { parseProspectFilters, filtersToParams } from "@/server/crm/prospect-filters";
import { saveProspects } from "@/server/crm/prospects";

const saveSchema = z.object({
  tenantSlug: z.string().max(48),
  personIds: z.array(z.string().min(1).max(200)).min(1).max(100),
  enrich: z.boolean(),
});

export async function saveSelectedProspects(formData: FormData) {
  const parsed = saveSchema.safeParse({
    tenantSlug: formData.get("tenantSlug"),
    personIds: formData.getAll("personId"),
    enrich: formData.get("enrich") === "on",
  });
  const slug = typeof formData.get("tenantSlug") === "string" ? String(formData.get("tenantSlug")) : "";
  const filters = parseProspectFilters({
    location: formData.get("location")?.toString(),
    industry: formData.get("industry")?.toString(),
    title: formData.get("title")?.toString(),
    sizeMin: formData.get("sizeMin")?.toString(),
    sizeMax: formData.get("sizeMax")?.toString(),
    trigger: formData.getAll("trigger").map(String),
  });
  const params = new URLSearchParams(filtersToParams(filters));

  if (!parsed.success) {
    params.set("error", "select");
    redirect(`/app/${encodeURIComponent(slug)}/prospects?${params}`);
  }

  // Tenant comes from the user's membership, not from the form.
  const ctx = await requireTenantContext(parsed.data.tenantSlug);
  const summary = await saveProspects(ctx, { filters, personIds: parsed.data.personIds, enrich: parsed.data.enrich });
  params.set(
    "saved",
    [summary.contactsCreated, summary.companiesCreated, summary.alreadySaved, summary.skippedSuppressed, summary.skippedCustomers].join("."),
  );
  redirect(`/app/${ctx.tenantSlug}/prospects?${params}`);
}
