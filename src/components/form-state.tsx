"use client";

import { useState, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api-client";

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function useSubmit() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ready = useHydrated();

  async function submit(fn: () => Promise<void>) {
    setPending(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await fn();
    } catch (error) {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors ?? {};
        setFieldErrors(fields);
        setFormError(Object.keys(fields).length === 0 ? error.message : null);
      } else {
        setFormError("Something went wrong");
      }
    } finally {
      setPending(false);
    }
  }

  return { fieldErrors, formError, pending, ready, submit };
}

export function Field({
  label,
  name,
  error,
  children,
  wide,
}: {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={wide ? "field wide" : "field"} htmlFor={name}>
      <span>{label}</span>
      {children}
      {error ? <em className="field-error">{error}</em> : null}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="form-error">{message}</p>;
}
