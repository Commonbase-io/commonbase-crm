import { formatInteger } from "@/lib/format";

export function Funnel({ steps }: { steps: { key: string; label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="space-y-2" aria-label="Funnel">
      {steps.map((step) => (
        <li key={step.key} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm">
          <span className="text-muted-foreground">{step.label}</span>
          <span className="h-2 rounded-full bg-muted" aria-hidden>
            <span className="block h-2 rounded-full bg-accent" style={{ width: `${(step.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-medium">{formatInteger(step.value)}</span>
        </li>
      ))}
    </ol>
  );
}
