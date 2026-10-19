import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/current";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.mustChangePassword) redirect("/change-password");
  if (session) redirect("/companies");
  return (
    <div className="auth-screen">
      <section className="auth-card">
        <h1>Commonbase CRM</h1>
        <p>Sign in with the email and password your admin sent you.</p>
        <LoginForm />
      </section>
    </div>
  );
}
