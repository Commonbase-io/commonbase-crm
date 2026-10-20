import type { Metadata } from "next";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { can, ROLE_LABELS } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { loadTeam } from "@/server/tenants/team";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const members = await loadTeam(ctx);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {can(ctx.role, "team.manage")
          ? "Inviting and changing roles is coming next. Nobody can change their own role."
          : "Only workspace admins can manage the team."}
      </p>
      {members.length === 0 ? (
        <EmptyState title="No members" />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Added</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <Td>
                    {m.displayName}
                    {m.userId === ctx.userId ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
                  </Td>
                  <Td>
                    <Badge>{ROLE_LABELS[m.role]}</Badge>
                  </Td>
                  <Td className="text-muted-foreground">{formatDate(m.joinedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
