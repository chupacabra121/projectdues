"use client";

import Link from "next/link";
import Image from "next/image";
import { ViewTransition } from "react";
import { Clock3, LayoutDashboard } from "lucide-react";
import { AgentProfile } from "@/lib/agents";

/**
 * The agent's "office" — a sticky left rail on their workspace pages. The large
 * portrait carries the shared view-transition name so the small header chip
 * morphs into it on navigation (the agent stepping out of the lineup). Below it:
 * identity + the agent's sub-tabs as a vertical nav (the lg counterpart to the
 * header's horizontal Row 3).
 */
export default function WorkspaceRail({
  agent,
  pathname,
}: {
  agent: AgentProfile;
  pathname: string;
}) {
  const active = agent.status === "active";
  return (
    <aside className="rail-enter sticky top-[7rem] hidden h-fit w-64 shrink-0 flex-col gap-4 self-start lg:flex">
      {/* Portrait — the morph target for the header chip */}
      <ViewTransition name={`agent-${agent.slug}`} share="morph">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-border/60">
          <Image
            src={agent.portrait ?? agent.image}
            alt={`${agent.name}, ${agent.role} agent`}
            fill
            sizes="16rem"
            className="object-cover object-top"
            priority
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" />
          <span
            className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md ${
              active
                ? "bg-primary/20 text-accent-foreground ring-1 ring-primary/40"
                : "bg-background/70 text-muted-foreground ring-1 ring-border"
            }`}
          >
            {active ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />
                On the clock
              </>
            ) : (
              <>
                <Clock3 className="h-3 w-3" />
                Coming soon
              </>
            )}
          </span>
        </div>
      </ViewTransition>

      {/* Identity + vertical nav slide in together */}
      <ViewTransition enter="rail-in" default="none">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {agent.role}
            </p>
            <h2 className="mt-0.5 font-display text-2xl leading-tight text-foreground">
              {agent.name}
            </h2>
            <p className="mt-0.5 text-xs text-accent-foreground">
              &ldquo;{agent.tagline}&rdquo;
            </p>
          </div>

          {agent.navTabs && (
            <nav className="flex flex-col gap-1">
              {agent.navTabs.map((tab) => {
                const on =
                  pathname === tab.href || pathname.startsWith(tab.href + "/");
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-current={on ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                      on
                        ? "bg-primary/15 text-accent-foreground ring-1 ring-primary/30"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <Link
            href="/dashboard"
            className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Back to dashboard
          </Link>
        </div>
      </ViewTransition>
    </aside>
  );
}
