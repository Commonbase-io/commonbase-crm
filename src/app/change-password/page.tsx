import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/current";
import { PasswordForm } from "@/components/password-form";

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <div className="auth-screen">
      <section className="auth-card">
        <h1>Choose a password</h1>
        <p>Use at least 8 characters, with a letter and a digit.</p>
        <PasswordForm />
      </section>
    </div>
  );
}
