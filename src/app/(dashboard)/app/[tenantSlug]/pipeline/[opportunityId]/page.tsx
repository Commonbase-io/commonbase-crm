import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/dashboard/action-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { StageMover } from "@/components/dashboard/stage-mover";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/format";
import { can } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { loadOpportunity } from "@/server/crm/pipeline";
import { STAGE_LABELS } from "@/server/crm/stages";
import { addNoteAction, addTaskAction, moveStageAction, reassignAction, toggleTaskAction } from "../actions";

export const metadata: Metadata = { title: "Opportunity" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENT_LABELS: Record<string, string> = {
  email_sent: "Email sent",
  email_replied: "Replied",
  positive_reply: "Positive reply",
  email_bounced: "Bounced",
  opted_out: "Opted out",
  meeting_booked: "Meeting booked",
  call_logged: "Call",
  note_logged: "Note",
};

export default async function OpportunityPage({ params }: { params: Promise<{ tenantSlug: string; opportunityId: string }> }) {
  const { tenantSlug, opportunityId } = await params;
  const ctx = await requireTenantContext(tenantSlug);
  if (!UUID.test(opportunityId)) notFound();
  const data = await loadOpportunity(ctx, opportunityId);
  if (!data) notFound();
  const { opportunity: o, notes, tasks, activities, team } = data;
  const hidden = (
    <>
      <input type="hidden" name="tenantSlug" value={ctx.tenantSlug} />
      <input type="hidden" name="opportunityId" value={o.id} />
    </>
  );

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/app/${ctx.tenantSlug}/pipeline`} className="text-muted-foreground hover:underline">← Pipeline</Link>
      </p>
      <PageHeader
        title={o.title}
        description={[o.company?.name, o.estimatedValue === null ? null : formatCurrency(o.estimatedValue)].filter(Boolean).join(" · ")}
        actions={<Badge tone={o.stage === "won" ? "success" : o.stage === "lost" ? "danger" : "neutral"}>{STAGE_LABELS[o.stage]}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Tasks</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No tasks.</p> : (
                <ul className="divide-y rounded-md border">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className={t.completedAt ? "text-muted-foreground line-through" : undefined}>{t.title}</span>
                      <span className="flex items-center gap-3 text-xs text-muted-foreground">
                        {t.dueAt ? `Due ${formatDate(t.dueAt)}` : null}
                        <form action={toggleTaskAction}>
                          {hidden}
                          <input type="hidden" name="taskId" value={t.id} />
                          <input type="hidden" name="completed" value={t.completedAt ? "false" : "true"} />
                          <button type="submit" className="underline">{t.completedAt ? "Reopen" : "Complete"}</button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <ActionForm action={addTaskAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                {hidden}
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="task-title">New task</Label>
                  <Input id="task-title" name="title" required maxLength={200} placeholder="e.g. Schedule site walkthrough" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-due">Due</Label>
                  <Input id="task-due" name="dueAt" type="date" className="sm:w-40" />
                </div>
                <SubmitButton variant="secondary">Add task</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <ActionForm action={addNoteAction} className="space-y-2">
                {hidden}
                <Label htmlFor="note-body" className="sr-only">Note</Label>
                <textarea id="note-body" name="body" required maxLength={5000} rows={3} placeholder="Add a note" className="w-full rounded-md border bg-surface p-3 text-sm" />
                <SubmitButton variant="secondary">Add note</SubmitButton>
              </ActionForm>
              {notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : (
                <ul className="space-y-3">
                  {notes.map((n) => (
                    <li key={n.id} className="rounded-md border p-3 text-sm">
                      <p className="whitespace-pre-wrap">{n.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{n.author} · {formatDate(n.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              {o.editable ? (
                <div className="space-y-1.5">
                  <p className="font-medium">Stage</p>
                  <StageMover action={moveStageAction} tenantSlug={ctx.tenantSlug} opportunityId={o.id} stage={o.stage} />
                </div>
              ) : null}
              {o.stage === "lost" && o.lostReason ? <p><span className="text-muted-foreground">Lost reason: </span>{o.lostReason}</p> : null}
              <dl className="grid grid-cols-[7rem_1fr] gap-y-2">
                <dt className="text-muted-foreground">Contact</dt>
                <dd>{o.contact ? <>{o.contact.name}{o.contact.title ? <span className="block text-xs text-muted-foreground">{o.contact.title}</span> : null}</> : "—"}</dd>
                <dt className="text-muted-foreground">Owner</dt>
                <dd>{o.owner?.name ?? "Unassigned"}</dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd>{o.sourceCampaign?.name ?? "—"}</dd>
                <dt className="text-muted-foreground">Quote req.</dt>
                <dd>{formatDate(o.quoteRequestedAt)}</dd>
                <dt className="text-muted-foreground">Closed</dt>
                <dd>{formatDate(o.closedAt)}</dd>
              </dl>
              {can(ctx.role, "opportunity.reassign") ? (
                <ActionForm action={reassignAction} className="space-y-1.5">
                  {hidden}
                  <Label htmlFor="ownerId">Reassign</Label>
                  <div className="flex gap-2">
                    <Select id="ownerId" name="ownerId" defaultValue={o.owner?.id ?? ""}>
                      <option value="" disabled>Choose owner</option>
                      {team.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
                    </Select>
                    <SubmitButton variant="secondary">Save</SubmitButton>
                  </div>
                </ActionForm>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Activity</CardTitle></CardHeader>
            <CardContent>
              {activities.length === 0 ? <p className="text-sm text-muted-foreground">No activity for this contact.</p> : (
                <ol className="space-y-2 text-sm">
                  {activities.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <span>{EVENT_LABELS[a.eventType] ?? a.eventType}</span>
                      <span className="text-muted-foreground">{formatDate(a.occurredAt)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
