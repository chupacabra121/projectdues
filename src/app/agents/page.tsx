import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Bot,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Megaphone,
  PiggyBank,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { getBudgetItems, getMembers, getSettings } from "@/lib/db";
import { buildForecast, fmtUSD } from "@/lib/forecast";
import AppShell from "@/components/AppShell";

export default async function AgentsHubPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;
  const items = getBudgetItems(user.id);
  const members = getMembers(user.id);
  const forecast = buildForecast(settings, items);

  const unpaid = members.filter(
    (m) =>
      m.amount_paid <
      (m.status === "active" ? settings.active_dues : settings.pledge_dues)
  ).length;

  // The hub's "next action" — the single most useful thing to do right now.
  const nextAction =
    forecast.remainingBalance < 0
      ? {
          title: "Your plans exceed projected funds",
          body: `The budget is ${fmtUSD(-forecast.remainingBalance)} short. Open the Budgeting Agent to trim events or adjust recruitment scenarios before money is committed.`,
          cta: "Review the budget",
          href: "/agents/budgeting/budget",
        }
      : unpaid > 0
        ? {
            title: `${unpaid} member${unpaid === 1 ? "" : "s"} still owe dues`,
            body: `${fmtUSD(forecast.outstandingDues)} in dues is still out. Filter the roster to unpaid members and copy their emails for a reminder.`,
            cta: "Open member roster",
            href: "/agents/budgeting/members",
          }
        : {
            title: "You're on track",
            body: `All plans are covered with ${fmtUSD(forecast.remainingBalance)} projected to spare at semester's end. Review the forecast or stress-test recruitment scenarios.`,
            cta: "Open Budgeting Agent",
            href: "/agents/budgeting",
          };

  return (
    <AppShell chapterName={user.chapter_name}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Hero */}
        <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch">
          <div className="p-1 sm:p-2">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  ChapterOS Agents
                </p>
                <h1 className="mt-2 font-display text-3xl text-foreground sm:text-4xl">
                  Your chapter&apos;s operating team
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Each agent owns one part of running the chapter — watching the
                  numbers, preparing actions, and asking you before anything
                  risky happens. Budgeting is live; dues collection, recruitment,
                  and events are on the way.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <ImpactTile
                label="Projected remaining"
                value={fmtUSD(forecast.remainingBalance)}
                icon={Wallet}
                negative={forecast.remainingBalance < 0}
              />
              <ImpactTile
                label="Outstanding dues"
                value={fmtUSD(forecast.outstandingDues)}
                icon={BellRing}
              />
              <ImpactTile
                label="Members on roster"
                value={String(members.length)}
                icon={Users}
              />
            </div>
          </div>

          {/* Next action — dark card */}
          <div className="rounded-[2rem] border border-border bg-foreground p-6 text-background shadow-sm sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-background/60">
                Next action
              </p>
              <Bot className="h-5 w-5 text-background/70" />
            </div>
            <h2 className="mt-3 text-xl font-semibold">{nextAction.title}</h2>
            <p className="mt-3 text-sm leading-6 text-background/70">{nextAction.body}</p>
            <Link
              href={nextAction.href}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-background px-4 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
            >
              {nextAction.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Agents */}
        <section className="mt-10">
          <div className="mb-4">
            <h2 className="font-display text-2xl text-foreground">Agents</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              One place for the agents working today and the ones being prepared.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <AgentTile
              name="Budgeting Agent"
              status="active"
              icon={PiggyBank}
              metric="Forecast · Budget · Members · Scenarios"
              description="Watches money in and money out, keeps the semester forecast live, and answers the only question that matters: can we afford what we're planning?"
              href="/agents/budgeting"
            />
            <AgentTile
              name="Dues Collection Agent"
              status="soon"
              icon={BellRing}
              metric="Email & SMS reminders · Escalation"
              description="Sends polite dues reminders by email and text, escalates gently when payments slip, and reports what's been collected — built on your member roster."
            />
            <AgentTile
              name="Recruitment Agent"
              status="soon"
              icon={Megaphone}
              metric="Pledge pipeline · Rush budget"
              description="Tracks the pledge pipeline against your recruitment scenarios and flags when rush spending isn't translating into signed bids."
            />
            <AgentTile
              name="Events Agent"
              status="soon"
              icon={CalendarRange}
              metric="Venues · Deposits · Per-head costs"
              description="Keeps every event's deposits, deadlines, and per-person costs in view so formal season doesn't surprise the budget."
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ImpactTile({
  label,
  value,
  icon: Icon,
  negative,
}: {
  label: string;
  value: string;
  icon: typeof Bot;
  negative?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-muted/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p
        className={`mt-3 text-2xl font-semibold ${negative ? "text-destructive" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function AgentTile({
  name,
  status,
  icon: Icon,
  metric,
  description,
  href,
}: {
  name: string;
  status: "active" | "soon";
  icon: typeof Bot;
  metric: string;
  description: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">{name}</h3>
            <p className="mt-1 text-xs font-medium text-muted-foreground">{metric}</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-5 flex items-center justify-between gap-3 text-sm font-semibold">
        <span className="text-muted-foreground">
          {status === "active" ? "Open now" : "In preparation"}
        </span>
        {href ? (
          <ArrowRight className="h-4 w-4 text-primary" />
        ) : (
          <Clock3 className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </>
  );

  if (!href) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 opacity-90">{content}</div>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      {content}
    </Link>
  );
}

function StatusBadge({ status }: { status: "active" | "soon" }) {
  const Icon = status === "active" ? CheckCircle2 : Clock3;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        status === "active"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {status === "active" ? "Active" : "Coming soon"}
    </span>
  );
}
