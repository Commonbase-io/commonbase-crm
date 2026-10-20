"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  Columns3,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
  Ticket,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth/session";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const ICONS: Record<string, LucideIcon> = {
  ticket: Ticket,
  briefcase: Briefcase,
  users: Users,
  dashboard: LayoutDashboard,
  settings: Settings,
  building: Building2,
  board: Columns3,
  import: Upload,
};

function isActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Shell({ session, children }: { session: SessionUser; children: React.ReactNode }) {
  const admin = session.role === "ADMIN";
  const platform = session.isPlatformAdmin && session.orgIsPlatform;
  const nav: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/deals", label: "Deals", icon: "ticket" },
    { href: "/contacts", label: "Contacts", icon: "briefcase" },
    { href: "/companies", label: "Companies", icon: "users" },
    { href: "/pipeline", label: "Pipeline", icon: "board" },
    { href: "/import", label: "Import", icon: "import" },
  ];
  if (platform) nav.push({ href: "/platform", label: "Organizations", icon: "building" });
  if (admin) nav.push({ href: "/settings", label: "Settings", icon: "settings" });
  return (
    <AppShell user={session} orgName={session.orgName} nav={nav} home="/dashboard">
      {children}
    </AppShell>
  );
}

export function AppShell({
  user,
  orgName,
  nav,
  home,
  children,
}: {
  user: Pick<SessionUser, "name" | "email">;
  orgName: string;
  nav: NavItem[];
  home: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="min-h-dvh bg-background md:flex">
      <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <Link href={home} className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-white">
            <Ticket className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block font-semibold tracking-tight">{orgName}</span>
            <span className="block text-xs text-sidebar-muted">CRM</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Primary">
          {nav.map((item) => {
            const Icon = ICONS[item.icon] ?? Ticket;
            const active = isActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.name}</div>
              <div className="truncate text-xs text-sidebar-muted">{user.email}</div>
            </div>
            <Link
              href="/change-password"
              aria-label="Change password"
              title="Change password"
              className="grid size-9 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <KeyRound className="size-4" />
            </Link>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              aria-label="Sign out"
              className="grid size-9 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-50"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col md:min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
          <Link href={home} className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-sidebar-primary text-white">
              <Ticket className="size-4" />
            </span>
            <span className="font-semibold tracking-tight">{orgName}</span>
          </Link>
          <span className="ml-auto max-w-[45%] truncate text-xs text-sidebar-muted">{user.name}</span>
          <Link
            href="/change-password"
            aria-label="Change password"
            className="grid size-8 place-items-center rounded-lg text-sidebar-muted hover:text-sidebar-foreground"
          >
            <KeyRound className="size-4" />
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            aria-label="Sign out"
            className="grid size-8 place-items-center rounded-lg text-sidebar-muted hover:text-sidebar-foreground disabled:opacity-50"
          >
            <LogOut className="size-4" />
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:px-8 md:py-8 md:pb-10">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-border bg-card px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Primary"
      >
        {nav.map((item) => {
          const Icon = ICONS[item.icon] ?? Ticket;
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-[4.5rem] flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
