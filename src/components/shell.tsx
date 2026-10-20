import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { SideNav } from "@/components/side-nav";
import type { SessionUser } from "@/lib/auth/session";

export function Shell({ session, children }: { session: SessionUser; children: React.ReactNode }) {
  const admin = session.role === "ADMIN";
  const platform = session.isPlatformAdmin && session.orgIsPlatform;
  const items = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/companies", label: "Companies" },
    { href: "/contacts", label: "Contacts" },
    { href: "/deals", label: "Deals" },
    { href: "/pipeline", label: "Pipeline" },
    { href: "/import", label: "Import" },
  ];
  if (admin) items.push({ href: "/settings/users", label: "Settings" });
  if (platform) items.push({ href: "/platform", label: "Platform" });
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">
            CB
          </span>
          <span>
            <strong>Commonbase</strong>
            <small>CRM</small>
          </span>
        </Link>
        <SideNav items={items} />
        <div className="who">
          <strong>{session.name}</strong>
          <span>{session.orgName}</span>
          <Link href="/change-password">Change password</Link>
          <LogoutButton />
        </div>
      </aside>
      <div className="main">{children}</div>
    </div>
  );
}
