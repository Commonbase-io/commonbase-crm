"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSessionUser } from "@/server/auth/session";
import { createUserClient } from "@/server/supabase/server";

export interface PasswordState {
  error?: string;
}

const schema = z
  .object({ password: z.string().min(10).max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

export async function setPasswordAction(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  await requireSessionUser();
  const parsed = schema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.some((i) => i.path[0] === "confirm")
        ? "The passwords don't match."
        : "Use at least 10 characters.",
    };
  }
  const supabase = await createUserClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.code === "same_password" ? "Choose a different password." : "Couldn't save your password. Try again." };
  redirect("/app");
}
