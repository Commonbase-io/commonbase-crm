"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

type State = { error?: string };

export function PasswordForm({ action }: { action: (prev: State, fd: FormData) => Promise<State> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="text-xs text-muted-foreground">At least 10 characters.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      {state.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>Save password</Button>
    </form>
  );
}
