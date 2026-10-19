import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/current";

export default async function Home() {
  const session = await getSession();
  redirect(session ? "/companies" : "/login");
}
