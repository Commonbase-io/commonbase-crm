"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type State = { error?: string; message?: string };

export function SyncNow({ action, tenantSlug }: { action: (prev: State, fd: FormData) => Promise<State>; tenantSlug: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Syncing…" : "Sync now"}
      </Button>
      {state.message ? <p role="status" className="text-sm text-muted-foreground">{state.message}</p> : null}
      {state.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}
