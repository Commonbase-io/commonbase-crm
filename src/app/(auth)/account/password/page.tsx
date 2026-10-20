import type { Metadata } from "next";
import { PasswordForm } from "@/components/dashboard/password-form";
import { requireSessionUser } from "@/server/auth/session";
import { setPasswordAction } from "./actions";

export const metadata: Metadata = { title: "Set your password" };

export default async function SetPasswordPage() {
  const user = await requireSessionUser();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight">Set your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user.email ? `For ${user.email}` : "Choose a password to finish signing in."}</p>
        <PasswordForm action={setPasswordAction} />
      </div>
    </main>
  );
}
