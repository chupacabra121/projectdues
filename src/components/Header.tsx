"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Building2, Clock3 } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { AGENTS } from "@/lib/agents";

const TABS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/budget", label: "Budget" },
  { href: "/members", label: "Members" },
  { href: "/scenarios", label: "Scenarios" },
];

export default function Header({ chapterName }: { chapterName: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      {/* Row 1 — brand + tabs + account */}
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="flex-shrink-0 font-display text-xl tracking-tight text-foreground sm:text-2xl"
        >
          Simple<span className="text-primary">Dues</span>
        </Link>

        <nav className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-center">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-shrink-0 items-center gap-3">
          <span className="hidden h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm text-foreground md:inline-flex">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="max-w-[180px] truncate">{chapterName}</span>
          </span>
          <form action={logout}>
            <button className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Row 2 — the team */}
      <div className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-center sm:px-6">
          {AGENTS.map((agent) => {
            const active =
              agent.status === "active"
                ? TABS.some((t) => pathname.startsWith(t.href))
                : pathname.startsWith(agent.href);
            return (
              <Link
                key={agent.slug}
                href={agent.href}
                title={
                  agent.status === "active"
                    ? `${agent.name} — ${agent.role}, on the clock`
                    : `${agent.name} — ${agent.role}, coming soon`
                }
                className={`flex flex-shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-3.5 transition-colors ${
                  active ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <span className="relative h-9 w-9 overflow-hidden rounded-full border border-border">
                  <Image
                    src={agent.image}
                    alt={`${agent.name}, ${agent.role} agent`}
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    {agent.name}
                    {agent.status === "active" ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    ) : (
                      <Clock3 className="h-3 w-3 text-muted-foreground/60" />
                    )}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {agent.role}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
