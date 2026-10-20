"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { OPPORTUNITY_STAGES, STAGE_LABELS, type OpportunityStage } from "@/server/crm/stages";

type State = { error?: string; ok?: boolean };

/** Stage change form. Moving to "lost" reveals a required reason field. */
export function StageMover({
  action,
  tenantSlug,
  opportunityId,
  stage,
  compact = false,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  tenantSlug: string;
  opportunityId: string;
  stage: OpportunityStage;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [next, setNext] = useState<OpportunityStage>(stage);
  const id = `stage-${opportunityId}`;

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Stage
        </label>
        <Select id={id} name="stage" value={next} onChange={(e) => setNext(e.target.value as OpportunityStage)} className={compact ? "h-8 text-xs" : undefined}>
          {OPPORTUNITY_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" size="sm" disabled={pending || (next === stage && next !== "lost")}>
          Move
        </Button>
      </div>
      {next === "lost" ? (
        <div>
          <label htmlFor={`${id}-reason`} className="sr-only">
            Lost reason
          </label>
          <Input id={`${id}-reason`} name="lostReason" placeholder="Why was it lost?" required maxLength={500} className={compact ? "h-8 text-xs" : undefined} />
        </div>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
