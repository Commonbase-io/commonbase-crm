import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";
import { DashboardNav } from "@/components/dashboard/nav";
import { ROLE_LABELS } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";

export default async function TenantLayout({ children, params }: { children: ReactNode; params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:block md:py-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{ctx.tenantName}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[ctx.role]}</p>
          </div>
          <form action={signOut} className="md:hidden">
            <button type="submit" className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Sign out">
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
        </div>
        <div className="px-2 pb-2 md:flex-1">
          <DashboardNav tenantSlug={ctx.tenantSlug} />
        </div>
        <form action={signOut} className="hidden border-t p-2 md:block">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </form>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
