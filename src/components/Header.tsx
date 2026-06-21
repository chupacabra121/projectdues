"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition, ViewTransition } from "react";
import { Building2, CalendarRange, Check, ChevronDown, Clock3, Moon, Plus, Settings, Sun, Users } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { setActivePeriod } from "@/app/actions/periods";
import { LayoutDashboard } from "lucide-react";
import { AGENTS, activeAgentFor } from "@/lib/agents";

export interface PeriodOption {
  id: number;
  name: string;
  start: string;
  end: string;
}

export default function Header({
  chapterName,
  periods,
  activePeriodId,
}: {
  chapterName: string;
  periods: PeriodOption[];
  activePeriodId: number | null;
}) {
  const pathname = usePathname();
  const activeAgent = activeAgentFor(pathname);
  const onDashboard = pathname.startsWith("/dashboard");
  const onMembers = pathname.startsWith("/members");

  return (
    <header
      className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl"
      style={{ viewTransitionName: "app-header" }}
    >
      {/* Row 1 — brand + home + account */}
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="flex-shrink-0 font-display text-xl tracking-tight text-foreground sm:text-2xl"
        >
          Simple<span className="text-primary">Dues</span>
        </Link>

        <nav className="flex flex-1 items-center gap-1">
          <Link
            href="/dashboard"
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              onDashboard
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/members"
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              onMembers
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Users className="h-4 w-4" />
            Members
          </Link>
        </nav>

        <div className="flex flex-shrink-0 items-center gap-3">
          <PeriodSwitcher periods={periods} activePeriodId={activePeriodId} />
          <span className="hidden h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm text-foreground lg:inline-flex">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="max-w-[160px] truncate">{chapterName}</span>
          </span>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </Link>
          <ThemeToggle />
          <form action={logout}>
            <button className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Row 2 — the team */}
      <div className="border-t border-border/40">
        <div
          className={`mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-6 ${
            activeAgent ? "sm:justify-start" : "sm:justify-center"
          }`}
        >
          {/* The active agent steps out of the lineup into the workspace rail; the
              rest close ranks. Each avatar shares a view-transition name with that
              agent's rail portrait, so it morphs across the navigation. */}
          {AGENTS.filter((agent) => agent.slug !== activeAgent?.slug).map((agent) => (
            <Link
              key={agent.slug}
              href={agent.href}
              title={
                agent.status === "active"
                  ? `${agent.name} — ${agent.role}, on the clock`
                  : `${agent.name} — ${agent.role}, coming soon`
              }
              className="flex flex-shrink-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-3.5 transition-colors hover:bg-muted/60"
            >
              <ViewTransition name={`agent-${agent.slug}`} share="morph" default="none">
                <span className="relative block h-9 w-9 overflow-hidden rounded-full border border-border">
                  <Image
                    src={agent.image}
                    alt={`${agent.name}, ${agent.role} agent`}
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </span>
              </ViewTransition>
              <span className="min-w-0 leading-tight">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  {agent.name}
                  {agent.status === "active" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />
                  ) : (
                    <Clock3 className="h-3 w-3 text-muted-foreground/80" />
                  )}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {agent.role}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Row 3 — the selected agent's sub-tabs (mobile/tablet only; on lg+ these
          live in the workspace rail as a vertical nav). */}
      {activeAgent?.navTabs && (
        <div className="border-t border-border/40 bg-muted/30 lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-center sm:px-6">
            <span className="mr-1 hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:inline">
              {activeAgent.name}
            </span>
            {activeAgent.navTabs.map((tab) => {
              const active =
                pathname === tab.href || pathname.startsWith(tab.href + "/");
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-primary/15 text-accent-foreground ring-1 ring-primary/30"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}

/** Sun/moon pill that flips the dual-theme: swaps .dark/.light on <html> and
 *  remembers the choice in a cookie (read server-side in layout.tsx). Which icon
 *  shows is driven purely by the html class via CSS — no state, no SSR flash. */
function ThemeToggle() {
  function toggle() {
    const el = document.documentElement;
    const next = !el.classList.contains("light");
    el.classList.toggle("light", next);
    el.classList.toggle("dark", !next);
    document.cookie = `sd-theme=${next ? "light" : "dark"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark and light theme"
      title="Toggle theme"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
    >
      <Sun className="theme-icon-dark h-4 w-4" />
      <Moon className="theme-icon-light h-4 w-4" />
    </button>
  );
}

function PeriodSwitcher({
  periods,
  activePeriodId,
}: {
  periods: PeriodOption[];
  activePeriodId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const active = periods.find((p) => p.id === activePeriodId) ?? periods[0];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Call the server action programmatically rather than via a submit button
  // inside the dropdown: closing the menu in the click handler would unmount
  // the <form> mid-submit and cancel the action. Close only after it resolves.
  function switchTo(id: number) {
    if (id === active?.id) {
      setOpen(false);
      return;
    }
    const fd = new FormData();
    fd.set("id", String(id));
    startTransition(async () => {
      await setActivePeriod(fd);
      setOpen(false);
    });
  }

  if (!active) {
    return (
      <Link
        href="/periods"
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted"
      >
        <CalendarRange className="h-4 w-4 text-muted-foreground" />
        Set up a period
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        title="Switch budgeting period"
      >
        <CalendarRange className="h-4 w-4 text-muted-foreground" />
        <span className="max-w-[140px] truncate">{active.name}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>

      {open && (
        <div className="glass-elevated absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl">
          <div className="max-h-72 overflow-y-auto py-1">
            {periods.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={isPending}
                onClick={() => switchTo(p.id)}
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.start} → {p.end}
                  </p>
                </div>
                {p.id === active.id && (
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-border/60 p-1">
            <Link
              href="/periods"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              New period / manage
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
