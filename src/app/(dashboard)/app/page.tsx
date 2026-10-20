import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ROLE_LABELS } from "@/server/auth/roles";
import { listMyTenants } from "@/server/auth/tenant-context";

// Entry point after sign-in. Most users belong to one tenant and go straight
// there. Users with several (Commonbase staff) pick one; the in-app workspace
// switcher is deferred until tenant #2 signs.
export default async function AppIndex() {
  const tenants = await listMyTenants();
  if (tenants.length === 1 && tenants[0]) redirect(`/app/${tenants[0].slug}/overview`);

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-xl font-semibold tracking-tight">Choose a workspace</h1>
      {tenants.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No workspace yet">Ask your administrator to add you to a workspace.</EmptyState>
        </div>
      ) : (
        <ul className="mt-6 divide-y rounded-lg border bg-surface">
          {tenants.map((tenant) => (
            <li key={tenant.slug}>
              <Link href={`/app/${tenant.slug}/overview`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted">
                <span className="font-medium">{tenant.name}</span>
                <span className="text-muted-foreground">{ROLE_LABELS[tenant.role]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
