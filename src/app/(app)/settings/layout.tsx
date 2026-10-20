import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/current";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (session.role !== "ADMIN") notFound();
  return children;
}
