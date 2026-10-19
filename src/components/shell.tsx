import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import type { SessionUser } from "@/lib/auth/session";

export function Shell({ session, children }: { session: SessionUser; children: React.ReactNode }) {
  const admin = session.role === "ADMIN";
  const platform = session.isPlatformAdmin && session.orgIsPlatform;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Commonbase
          <span>CRM</span>
        </div>
        <nav className="nav">
          <Link href="/companies">Companies</Link>
          <Link href="/contacts">Contacts</Link>
          <Link href="/deals">Deals</Link>
          <Link href="/pipeline">Pipeline</Link>
          <Link href="/import">Import</Link>
          {admin ? <Link href="/settings/users">Users</Link> : null}
          {admin ? <Link href="/settings/pipeline">Stages</Link> : null}
          {platform ? <Link href="/platform">Platform</Link> : null}
        </nav>
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
