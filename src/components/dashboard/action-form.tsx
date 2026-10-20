"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type State = { error?: string; ok?: boolean; message?: string };

/** Form bound to a server action returning { error?, ok?, message? }; resets when ok. */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.message && !state.error ? (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  label,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  /** Accessible name when the visible text is ambiguous (e.g. "Remove" in a table). */
  label?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending} aria-label={label}>
      {children}
    </Button>
  );
}
