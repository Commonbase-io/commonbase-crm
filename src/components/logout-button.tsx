"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="button secondary"
      type="button"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
