import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/current";
import { Shell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (session.mustChangePassword) redirect("/change-password");
  return <Shell session={session}>{children}</Shell>;
}
