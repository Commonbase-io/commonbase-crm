import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/current";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  redirect("/dashboard");
}
