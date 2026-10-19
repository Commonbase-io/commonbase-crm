"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { Field, FormError, useSubmit } from "@/components/form-state";

export function PasswordForm() {
  const router = useRouter();
  const { fieldErrors, formError, pending, ready, submit } = useSubmit();
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget).entries());
        void submit(async () => {
          await api("/api/auth/change-password", { method: "POST", body: data });
          router.push("/companies");
          router.refresh();
        });
      }}
    >
      <Field label="Current password" name="currentPassword" error={fieldErrors.currentPassword}>
        <input id="currentPassword" name="currentPassword" type="password" required />
      </Field>
      <Field label="New password" name="newPassword" error={fieldErrors.newPassword}>
        <input id="newPassword" name="newPassword" type="password" required />
      </Field>
      <FormError message={formError} />
      <button className="button" type="submit" disabled={!ready || pending}>
        {pending ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
