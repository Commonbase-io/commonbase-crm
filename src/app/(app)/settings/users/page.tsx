import { redirect } from "next/navigation";

export default function UsersSettingsRedirect() {
  redirect("/settings?tab=users");
}
