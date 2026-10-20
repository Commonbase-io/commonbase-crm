import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/dashboard/action-form";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { can, ROLE_LABELS, ROLES } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { loadTeam } from "@/server/tenants/team";
import { changeRoleAction, inviteAction, removeAction, resendAction } from "./actions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  const members = await loadTeam(ctx);
  const manage = can(ctx.role, "team.manage");
  const slug = <input type="hidden" name="tenantSlug" value={ctx.tenantSlug} />;

  return (
    <div className="space-y-6">
      {manage ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite someone</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={inviteAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_10rem_auto] sm:items-end">
              {slug}
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input id="invite-email" name="email" type="email" required maxLength={320} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-name">Name (optional)</Label>
                <Input id="invite-name" name="displayName" maxLength={120} autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select id="invite-role" name="role" defaultValue="sales_rep">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </Select>
              </div>
              <SubmitButton>Send invite</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">Only workspace admins can manage the team.</p>
      )}

      {members.length === 0 ? (
        <EmptyState title="No members" />
      ) : (
        <Card>
          <Table aria-label="Team members">
            <thead>
              <tr>
                <Th>Name</Th>
                {manage ? <Th className="hidden md:table-cell">Email</Th> : null}
                <Th>Role</Th>
                <Th className="hidden md:table-cell">Added</Th>
                {manage ? <Th className="w-48">Actions</Th> : null}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const self = m.userId === ctx.userId;
                const hidden = (
                  <>
                    {slug}
                    <input type="hidden" name="userId" value={m.userId} />
                  </>
                );
                return (
                  <tr key={m.userId}>
                    <Td>
                      <span className="font-medium">{m.displayName}</span>
                      {self ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
                      {m.invited ? <Badge tone="warning" className="ml-2">Invited</Badge> : null}
                    </Td>
                    {manage ? <Td className="hidden break-all text-muted-foreground md:table-cell">{m.email ?? "—"}</Td> : null}
                    <Td>
                      {manage && !self ? (
                        <ActionForm action={changeRoleAction} className="flex gap-2">
                          {hidden}
                          <label htmlFor={`role-${m.userId}`} className="sr-only">Role for {m.displayName}</label>
                          <Select id={`role-${m.userId}`} name="role" defaultValue={m.role} className="h-8 w-36 text-xs">
                            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </Select>
                          <SubmitButton variant="secondary" label={`Save role for ${m.displayName}`}>Save</SubmitButton>
                        </ActionForm>
                      ) : (
                        <Badge>{ROLE_LABELS[m.role]}</Badge>
                      )}
                    </Td>
                    <Td className="hidden text-muted-foreground md:table-cell">{formatDate(m.joinedAt)}</Td>
                    {manage ? (
                      <Td>
                        {self ? (
                          <span className="text-xs text-muted-foreground">Another admin can change this</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {m.invited ? (
                              <ActionForm action={resendAction}>
                                {hidden}
                                <SubmitButton variant="secondary" label={`Resend invite to ${m.displayName}`}>Resend invite</SubmitButton>
                              </ActionForm>
                            ) : null}
                            <ActionForm action={removeAction}>
                              {hidden}
                              <SubmitButton variant="secondary" label={`Remove ${m.displayName}`}>Remove</SubmitButton>
                            </ActionForm>
                          </div>
                        )}
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
