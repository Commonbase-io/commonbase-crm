"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api-client";

export function ArchiveButton({ path, next }: { path: string; next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="actions">
      <button
        className="button secondary"
        type="button"
        onClick={async () => {
          if (!window.confirm("Archive this record?")) return;
          setError(null);
          try {
            await api(path, { method: "DELETE" });
          } catch (caught) {
            if (caught instanceof ApiError) {
              const field = caught.fieldErrors ? Object.values(caught.fieldErrors)[0] : null;
              setError(field || caught.message);
              return;
            }
            setError("Something went wrong");
            return;
          }
          router.push(next);
          router.refresh();
        }}
      >
        Archive
      </button>
      {error ? <em className="field-error">{error}</em> : null}
    </span>
  );
}
