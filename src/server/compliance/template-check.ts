// Every outbound email template must carry the sender's postal address and a
// working unsubscribe link. Mirrors app.campaign_compliance_problem() in SQL.

export const UNSUBSCRIBE_TOKEN = "{{unsubscribe_url}}";
export const POSTAL_ADDRESS_TOKEN = "{{sender_postal_address}}";

export interface StepForCheck {
  position: number;
  stepType: "email" | "task";
  body: string;
}

export type ComplianceProblem =
  | { code: "missing_postal_address" }
  | { code: "no_email_steps" }
  | { code: "missing_unsubscribe"; position: number }
  | { code: "missing_postal_address_token"; position: number };

export function checkCampaignCompliance(input: { postalAddress: string | null; steps: StepForCheck[] }): ComplianceProblem[] {
  const problems: ComplianceProblem[] = [];
  if (!input.postalAddress?.trim()) problems.push({ code: "missing_postal_address" });
  const emailSteps = input.steps.filter((step) => step.stepType === "email");
  if (emailSteps.length === 0) problems.push({ code: "no_email_steps" });
  for (const step of emailSteps) {
    if (!step.body.includes(UNSUBSCRIBE_TOKEN)) problems.push({ code: "missing_unsubscribe", position: step.position });
    if (!step.body.includes(POSTAL_ADDRESS_TOKEN)) problems.push({ code: "missing_postal_address_token", position: step.position });
  }
  return problems;
}

export function describeProblem(problem: ComplianceProblem): string {
  switch (problem.code) {
    case "missing_postal_address":
      return "Add the sender's postal address in tenant settings.";
    case "no_email_steps":
      return "Add at least one email step.";
    case "missing_unsubscribe":
      return `Step ${problem.position} needs ${UNSUBSCRIBE_TOKEN}.`;
    case "missing_postal_address_token":
      return `Step ${problem.position} needs ${POSTAL_ADDRESS_TOKEN}.`;
  }
}
