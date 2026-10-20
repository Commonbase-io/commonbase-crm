import { redirect } from "next/navigation";

export default async function TenantIndex({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  redirect(`/app/${tenantSlug}/overview`);
}
