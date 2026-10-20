import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/dashboard/action-form";
import { CampaignStatusBadge } from "@/components/dashboard/campaign-status-badge";
import { DataModeBadge } from "@/components/dashboard/data-mode-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { SelectAll } from "@/components/dashboard/select-all";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { can } from "@/server/auth/roles";
import { requireTenantContext } from "@/server/auth/tenant-context";
import { CampaignNotFoundError, loadCampaign, loadEnrollableContacts } from "@/server/campaigns/campaigns";
import type { ExistingStatus } from "@/server/campaigns/enrollment-plan";
import { canTransition, ENROLLABLE } from "@/server/campaigns/state";
import { describeProblem, POSTAL_ADDRESS_TOKEN, UNSUBSCRIBE_TOKEN } from "@/server/compliance/template-check";
import { campaignCommandAction, enrollAction, saveStepAction, stepCommandAction, updateDraftAction } from "../actions";

export const metadata: Metadata = { title: "Campaign" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ENROLLMENT_TONE: Record<ExistingStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  pending: "neutral",
  enrolling: "info",
  enrolled: "success",
  failed: "danger",
  removed: "neutral",
  suppressed: "warning",
};

const DEFAULT_BODY = `Hi {{first_name}},\n\n\n\n{{sender_name}}\n${POSTAL_ADDRESS_TOKEN}\nUnsubscribe: ${UNSUBSCRIBE_TOKEN}`;

function parseEnrolled(value: string | undefined) {
  if (!value || !/^\d+(\.\d+){5}$/.test(value)) return null;
  const [enrolled, failed, suppressed, noEmail, already, optOuts] = value.split(".").map(Number) as number[];
  return { enrolled, failed, suppressed, noEmail, already, optOuts };
}

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string; campaignId: string }>;
  searchParams: Promise<{ enrolled?: string }>;
}) {
  const { tenantSlug, campaignId } = await params;
  const query = await searchParams;
  const ctx = await requireTenantContext(tenantSlug);
  if (!UUID.test(campaignId)) notFound();
  let data;
  try {
    data = await loadCampaign(ctx, campaignId);
  } catch (error) {
    if (error instanceof CampaignNotFoundError) notFound();
    throw error;
  }
  const { campaign, steps, mailboxes, compliance, enrollments } = data;
  const canEdit = can(ctx.role, "campaign.edit");
  const canApprove = can(ctx.role, "campaign.approve");
  const canEnroll = can(ctx.role, "campaign.enroll");
  const isDraft = campaign.status === "draft";
  const editable = isDraft && canEdit;
  const enrollable = canEnroll && ENROLLABLE.includes(campaign.status);
  const contacts = enrollable ? await loadEnrollableContacts(ctx, campaignId) : [];
  const pendingCount = enrollments.filter((e) => e.status === "enrolling").length;
  const enrolledSummary = parseEnrolled(query.enrolled);

  const ids = (
    <>
      <input type="hidden" name="tenantSlug" value={ctx.tenantSlug} />
      <input type="hidden" name="campaignId" value={campaign.id} />
    </>
  );
  const command = (name: string, label: string, variant: "primary" | "secondary" = "secondary") => (
    <ActionForm key={name} action={campaignCommandAction}>
      {ids}
      <input type="hidden" name="command" value={name} />
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </ActionForm>
  );

  const commands = [
    isDraft && canApprove && compliance.length === 0 ? command("approve", "Approve", "primary") : null,
    canEdit && canTransition(campaign.status, "draft") ? command("draft", "Back to draft") : null,
    canEnroll && canTransition(campaign.status, "paused") ? command("pause", "Pause") : null,
    canEnroll && campaign.status === "paused" ? command("resume", "Resume", "primary") : null,
    canEnroll && canTransition(campaign.status, "completed") ? command("complete", "Mark completed") : null,
    canEnroll && (pendingCount > 0 || campaign.status === "failed") && campaign.status !== "draft" ? command("retry", `Retry pending${pendingCount ? ` (${pendingCount})` : ""}`) : null,
  ].filter(Boolean);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/app/${ctx.tenantSlug}/campaigns`} className="text-muted-foreground hover:underline">← Campaigns</Link>
      </p>
      <PageHeader
        title={campaign.name}
        description={
          campaign.approvedAt ? `Approved by ${campaign.approvedBy ?? "a former member"} on ${formatDate(campaign.approvedAt)}` : "Not approved"
        }
        actions={
          <>
            <DataModeBadge mode={campaign.dataMode} />
            <CampaignStatusBadge status={campaign.status} />
          </>
        }
      />

      {commands.length ? <div className="mb-6 flex flex-wrap items-start gap-2">{commands}</div> : null}

      {campaign.lastError ? (
        <p role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm">
          Last error: {campaign.lastError}
        </p>
      ) : null}
      {enrolledSummary ? (
        <p role="status" className="mb-4 rounded-md border border-success/30 bg-success/10 p-3 text-sm">
          Enrolled {enrolledSummary.enrolled}.
          {enrolledSummary.failed ? ` ${enrolledSummary.failed} failed.` : ""}
          {enrolledSummary.suppressed ? ` ${enrolledSummary.suppressed} skipped (suppressed).` : ""}
          {enrolledSummary.noEmail ? ` ${enrolledSummary.noEmail} skipped (no email).` : ""}
          {enrolledSummary.already ? ` ${enrolledSummary.already} already enrolled.` : ""}
          {` Opt-out sync added ${enrolledSummary.optOuts} new suppression${enrolledSummary.optOuts === 1 ? "" : "s"}.`}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sequence</CardTitle>
              {!isDraft ? <span className="text-xs text-muted-foreground">Locked after approval</span> : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {steps.length === 0 ? <p className="text-sm text-muted-foreground">No steps yet.</p> : null}
              {steps.map((step, index) =>
                editable ? (
                  <div key={step.id} className="rounded-md border p-3">
                    <ActionForm action={saveStepAction} className="space-y-3">
                      {ids}
                      <input type="hidden" name="stepId" value={step.id} />
                      <div className="flex flex-wrap items-end gap-3">
                        <p className="text-sm font-semibold">Step {step.position}</p>
                        <div className="space-y-1">
                          <Label htmlFor={`type-${step.id}`} className="text-xs">Type</Label>
                          <Select id={`type-${step.id}`} name="stepType" defaultValue={step.stepType} className="h-8 w-28">
                            <option value="email">Email</option>
                            <option value="task">Task</option>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`delay-${step.id}`} className="text-xs">Wait (days)</Label>
                          <Input id={`delay-${step.id}`} name="delayDays" type="number" min={0} max={365} defaultValue={step.delayDays} className="h-8 w-24" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`subject-${step.id}`} className="text-xs">Subject</Label>
                        <Input id={`subject-${step.id}`} name="subject" defaultValue={step.subject ?? ""} maxLength={300} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`body-${step.id}`} className="text-xs">Body</Label>
                        <textarea id={`body-${step.id}`} name="body" defaultValue={step.body} rows={6} className="w-full rounded-md border bg-surface p-3 font-mono text-xs" />
                      </div>
                      <SubmitButton variant="secondary">Save step {step.position}</SubmitButton>
                    </ActionForm>
                    <div className="mt-2 flex gap-2">
                      {index > 0 ? (
                        <ActionForm action={stepCommandAction}>
                          {ids}
                          <input type="hidden" name="stepId" value={step.id} />
                          <input type="hidden" name="command" value="up" />
                          <SubmitButton variant="secondary">Move up</SubmitButton>
                        </ActionForm>
                      ) : null}
                      <ActionForm action={stepCommandAction}>
                        {ids}
                        <input type="hidden" name="stepId" value={step.id} />
                        <input type="hidden" name="command" value="delete" />
                        <SubmitButton variant="secondary">Delete step {step.position}</SubmitButton>
                      </ActionForm>
                    </div>
                  </div>
                ) : (
                  <div key={step.id} className="rounded-md border p-3 text-sm">
                    <p className="font-semibold">
                      Step {step.position} · {step.stepType === "email" ? "Email" : "Task"} · wait {step.delayDays} day{step.delayDays === 1 ? "" : "s"}
                    </p>
                    {step.subject ? <p className="mt-1">{step.subject}</p> : null}
                    <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-muted-foreground">{step.body}</pre>
                  </div>
                ),
              )}
              {editable ? (
                <ActionForm action={saveStepAction} className="space-y-3 rounded-md border border-dashed p-3">
                  {ids}
                  <p className="text-sm font-semibold">Add a step</p>
                  <div className="flex flex-wrap gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="new-type" className="text-xs">Type</Label>
                      <Select id="new-type" name="stepType" defaultValue="email" className="h-8 w-28">
                        <option value="email">Email</option>
                        <option value="task">Task</option>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new-delay" className="text-xs">Wait (days)</Label>
                      <Input id="new-delay" name="delayDays" type="number" min={0} max={365} defaultValue={steps.length ? 3 : 0} className="h-8 w-24" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-subject" className="text-xs">Subject</Label>
                    <Input id="new-subject" name="subject" maxLength={300} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-body" className="text-xs">Body</Label>
                    <textarea id="new-body" name="body" defaultValue={DEFAULT_BODY} rows={6} className="w-full rounded-md border bg-surface p-3 font-mono text-xs" />
                  </div>
                  <SubmitButton variant="secondary">Add step</SubmitButton>
                </ActionForm>
              ) : null}
            </CardContent>
          </Card>

          {enrollable ? (
            <Card>
              <CardHeader>
                <CardTitle>Enroll contacts</CardTitle>
                <span className="text-xs text-muted-foreground">Opt-outs sync and suppression is re-checked first</span>
              </CardHeader>
              <CardContent>
                {contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No contacts with an email left to enroll. Save and enrich prospects first.</p>
                ) : (
                  <ActionForm action={enrollAction} className="space-y-3">
                    {ids}
                    {/* One key per rendered form: a double submit or retry of this form is processed once. */}
                    <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                    <Table aria-label="Contacts to enroll">
                      <thead>
                        <tr>
                          <Th className="w-10"><SelectAll name="contactId" label="Select all contacts" /></Th>
                          <Th>Contact</Th>
                          <Th className="hidden md:table-cell">Company</Th>
                          <Th>Email</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {contacts.map((c) => (
                          <tr key={c.id}>
                            <Td><input type="checkbox" name="contactId" value={c.id} aria-label={`Select ${c.name}`} className="size-4" /></Td>
                            <Td>
                              <div className="font-medium">{c.name}</div>
                              <div className="text-xs text-muted-foreground">{c.title ?? "—"}</div>
                            </Td>
                            <Td className="hidden md:table-cell">
                              {c.company ?? "—"}
                              {c.isCustomer ? <Badge className="ml-2">Customer</Badge> : null}
                            </Td>
                            <Td><Badge tone={c.emailStatus === "verified" ? "success" : "warning"}>{c.emailStatus}</Badge></Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                    <SubmitButton>Enroll selected</SubmitButton>
                  </ActionForm>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader><CardTitle>Enrollments</CardTitle></CardHeader>
            <CardContent>
              {enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody enrolled yet.</p>
              ) : (
                <Table aria-label="Enrollments">
                  <thead>
                    <tr>
                      <Th>Contact</Th>
                      <Th>Status</Th>
                      <Th className="hidden md:table-cell">Enrolled</Th>
                      <Th className="hidden md:table-cell">Note</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e) => (
                      <tr key={e.contactId}>
                        <Td>
                          <div className="font-medium">{e.name}</div>
                          <div className="text-xs text-muted-foreground">{e.title ?? "—"}</div>
                        </Td>
                        <Td><Badge tone={ENROLLMENT_TONE[e.status]}>{e.status}</Badge></Td>
                        <Td className="hidden md:table-cell">{formatDate(e.enrolledAt)}</Td>
                        <Td className="hidden text-xs text-muted-foreground md:table-cell">{e.lastError ?? ""}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Compliance</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {compliance.length === 0 ? (
                <p className="text-success">Ready: postal address and unsubscribe link present in every email step.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-danger">
                  {compliance.map((p, i) => <li key={i}>{describeProblem(p)}</li>)}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Every email step needs <code>{UNSUBSCRIBE_TOKEN}</code> and <code>{POSTAL_ADDRESS_TOKEN}</code>. Approval is blocked otherwise.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
            <CardContent>
              {editable ? (
                <ActionForm action={updateDraftAction} className="space-y-3">
                  {ids}
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" defaultValue={campaign.name} required maxLength={200} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="mailboxId">Send from</Label>
                    <Select id="mailboxId" name="mailboxId" defaultValue={campaign.mailboxId ?? ""} required>
                      {mailboxes.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}
                    </Select>
                  </div>
                  <SubmitButton variant="secondary">Save settings</SubmitButton>
                </ActionForm>
              ) : (
                <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Send from</dt>
                  <dd className="break-all">{mailboxes.find((m) => m.id === campaign.mailboxId)?.email ?? "—"}</dd>
                </dl>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
