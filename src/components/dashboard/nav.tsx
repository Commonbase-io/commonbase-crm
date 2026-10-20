"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, KanbanSquare, Mail, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { segment: "overview", label: "Overview", icon: BarChart3 },
  { segment: "prospects", label: "Prospects", icon: Search },
  { segment: "campaigns", label: "Campaigns", icon: Mail },
  { segment: "pipeline", label: "Pipeline", icon: KanbanSquare },
  { segment: "settings", label: "Settings", icon: Settings },
] as const;

export function DashboardNav({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map(({ segment, label, icon: Icon }) => {
        const href = `/app/${tenantSlug}/${segment}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={segment}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
