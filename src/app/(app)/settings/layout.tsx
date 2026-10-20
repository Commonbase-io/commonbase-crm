import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/current";
import { SettingsTabs } from "@/components/settings-tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (session.role !== "ADMIN") notFound();
  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="lede">People and the pipeline for {session.orgName}.</p>
        </div>
      </div>
      <SettingsTabs />
      {children}
    </section>
  );
}
