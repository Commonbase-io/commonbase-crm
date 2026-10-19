import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/current";
import { listUsers } from "@/lib/crm/users";
import { UsersPanel } from "@/components/users-panel";

export default async function UsersSettingsPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN") notFound();
  const users = await listUsers(session, true);
  return (
    <section>
      <div className="page-head">
        <h1>Users</h1>
      </div>
      <UsersPanel users={users} />
    </section>
  );
}
