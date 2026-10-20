import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/current";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.mustChangePassword) redirect("/change-password");
  if (session) redirect("/dashboard");
  return (
    <main className="login-screen">
      <div className="login-aside">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            CB
          </span>
          <span>
            <strong>Commonbase</strong>
            <small>CRM</small>
          </span>
        </div>
        <div>
          <h2>From the first conversation to a closed deal.</h2>
          <p>Keep companies, the people who work there, and the deals you are working in one place.</p>
          <ul>
            <li>
              <span className="tick" aria-hidden="true">
                1
              </span>
              Companies come first
            </li>
            <li>
              <span className="tick" aria-hidden="true">
                2
              </span>
              Contacts belong to a company
            </li>
            <li>
              <span className="tick" aria-hidden="true">
                3
              </span>
              Deals need both before they can be saved
            </li>
          </ul>
        </div>
        <p>© {new Date().getFullYear()} Commonbase</p>
      </div>
      <div className="login-panel">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand-mark" aria-hidden="true">
              CB
            </span>
            <span>
              <strong>Commonbase</strong>
              <small>CRM</small>
            </span>
          </div>
          <div className="page-head">
            <div>
              <h1>Sign in</h1>
              <p>Use the email and password your admin set up for you.</p>
            </div>
          </div>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}