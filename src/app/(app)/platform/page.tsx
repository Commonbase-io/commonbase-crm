import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/current";
import { listClientOrgs } from "@/lib/platform/orgs";
import { PlatformPanel } from "@/components/platform-panel";

export default async function PlatformPage() {
  const session = await requireSession();
  if (!session.isPlatformAdmin || !session.orgIsPlatform) notFound();
  const orgs = await listClientOrgs(session);
  return (
    <section>
      <div className="page-head">
        <h1>Platform</h1>
      </div>
      <PlatformPanel orgs={orgs} />
    </section>
  );
}
