import { redirect } from "next/navigation";
import { Ticket } from "lucide-react";
import { getSession } from "@/lib/auth/current";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.mustChangePassword) redirect("/change-password");
  if (session) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="surface-card w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-white">
            <Ticket className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block font-semibold tracking-tight">Commonbase</span>
            <span className="block text-xs text-muted-foreground">CRM</span>
          </span>
        </div>
        <h1 className="page-heading">Sign in</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">Use the email and password your admin set up for you.</p>
        <LoginForm />
      </div>
    </main>
  );
}