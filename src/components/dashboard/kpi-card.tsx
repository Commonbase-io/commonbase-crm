import { cn } from "@/lib/utils";

export function KpiCard({ label, value, hint, emphasis = false }: { label: string; value: string; hint?: string; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-surface p-4", emphasis && "border-foreground/20")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-semibold tracking-tight", emphasis ? "text-2xl" : "text-xl")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
