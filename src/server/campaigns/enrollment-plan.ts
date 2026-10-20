import { isSuppressed, type SuppressionSet } from "@/server/compliance/suppression";

// Decides, immediately before enrollment, which contacts may be sent to the
// provider. Pure so it can be tested exhaustively; the database trigger
// app.enforce_enrollment_allowed() re-checks suppression as a backstop.

export interface EnrollmentCandidate {
  contactId: string;
  email: string | null;
  externalRef: string | null;
}

export type ExistingStatus = "pending" | "enrolling" | "enrolled" | "failed" | "removed" | "suppressed";

export interface EnrollmentPlan {
  /** New or previously failed contacts to send now. */
  toEnroll: EnrollmentCandidate[];
  /** Suppressed (email or domain) at enrollment time. Recorded, never sent. */
  suppressed: EnrollmentCandidate[];
  noEmail: EnrollmentCandidate[];
  /** Already enrolled or in flight; left alone (retries go through reconciliation). */
  alreadyEnrolled: EnrollmentCandidate[];
}

export function planEnrollment(
  candidates: EnrollmentCandidate[],
  suppressions: SuppressionSet,
  existing: ReadonlyMap<string, ExistingStatus>,
): EnrollmentPlan {
  const plan: EnrollmentPlan = { toEnroll: [], suppressed: [], noEmail: [], alreadyEnrolled: [] };
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.contactId)) continue;
    seen.add(candidate.contactId);
    const status = existing.get(candidate.contactId);
    if (status === "enrolled" || status === "enrolling") plan.alreadyEnrolled.push(candidate);
    else if (!candidate.email) plan.noEmail.push(candidate);
    else if (isSuppressed(candidate.email, suppressions)) plan.suppressed.push(candidate);
    else plan.toEnroll.push(candidate);
  }
  return plan;
}

/**
 * Provider-side contact id. Saved prospects carry the provider's id; contacts
 * added by hand get a stable synthetic id so retries map to the same contact.
 */
export function providerContactId(candidate: EnrollmentCandidate): string {
  return candidate.externalRef ?? `local:${candidate.contactId}`;
}
