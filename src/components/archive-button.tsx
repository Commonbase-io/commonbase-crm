"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export function ArchiveButton({ path, next }: { path: string; next: string }) {
  const router = useRouter();
  return (
    <button
      className="button secondary"
      type="button"
      onClick={async () => {
        if (!window.confirm("Archive this record?")) return;
        await api(path, { method: "DELETE" });
        router.push(next);
        router.refresh();
      }}
    >
      Archive
    </button>
  );
}
