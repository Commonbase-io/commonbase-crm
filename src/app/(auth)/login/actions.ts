"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { log } from "@/server/log";
import { createUserClient } from "@/server/supabase/server";

const credentialsSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(200),
});

export async function signIn(formData: FormData) {
  const parsed = credentialsSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) redirect("/login?error=invalid");

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Same message for unknown user and wrong password; details stay in logs (redacted).
    log.warn("sign-in failed", { reason: error.code ?? error.message });
    redirect("/login?error=invalid");
  }
  redirect("/app");
}

export async function signOut() {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  redirect("/login");
}
