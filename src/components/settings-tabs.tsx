"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/users", label: "Users" },
  { href: "/settings/pipeline", label: "Pipeline" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="Settings">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={pathname === tab.href ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
