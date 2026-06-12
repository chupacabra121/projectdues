"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Gauge, Users, Wallet } from "lucide-react";

const TABS = [
  { href: "/agents/budgeting", label: "Overview", icon: Gauge, exact: true },
  { href: "/agents/budgeting/budget", label: "Budget", icon: Wallet },
  { href: "/agents/budgeting/members", label: "Members", icon: Users },
  { href: "/agents/budgeting/scenarios", label: "Scenarios", icon: BarChart3 },
];

export default function AgentTabs() {
  const pathname = usePathname();
  return (
    <nav className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex h-10 flex-shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${
              active
                ? "bg-foreground text-background"
                : "border border-border bg-background text-foreground hover:border-foreground/40 hover:bg-muted"
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
