import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/dashboard/page-header";

export default async function SettingsLayout({ children, params }: { children: ReactNode; params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const base = `/app/${tenantSlug}/settings`;
  return (
    <>
      <PageHeader title="Settings" />
      <nav aria-label="Settings" className="mb-6 flex gap-4 border-b text-sm">
        <Link href={base} className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground hover:text-foreground">General</Link>
        <Link href={`${base}/team`} className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground hover:text-foreground">Team</Link>
        <Link href={`${base}/integrations`} className="-mb-px border-b-2 border-transparent pb-2 text-muted-foreground hover:text-foreground">Integrations</Link>
      </nav>
      {children}
    </>
  );
}
