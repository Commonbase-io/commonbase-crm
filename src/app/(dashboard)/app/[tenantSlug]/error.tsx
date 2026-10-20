"use client";

import { Button } from "@/components/ui/button";

export default function TenantError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border bg-surface p-6">
      <p className="text-sm font-medium">Something went wrong loading this page.</p>
      <p className="mt-1 text-sm text-muted-foreground">Try again. If it keeps happening, contact Commonbase support.</p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
