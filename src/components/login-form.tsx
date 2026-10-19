"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Field, FormError, useSubmit } from "@/components/form-state";

export function LoginForm() {
  const router = useRouter();
  const { fieldErrors, formError, pending, ready, submit } = useSubmit();
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        void submit(async () => {
          const result = await api<{ mustChangePassword: boolean }>("/api/auth/login", { method: "POST", body: data });
          router.push(result.mustChangePassword ? "/change-password" : "/companies");
          router.refresh();
        });
      }}
    >
      <Field label="Email" name="email" error={fieldErrors.email}>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password" name="password" error={fieldErrors.password}>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormError message={formError} />
      <button className="button" type="submit" disabled={!ready || pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
