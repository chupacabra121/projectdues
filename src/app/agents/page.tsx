import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  Users,
  Wallet,
} from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { getBudgetItems, getMembers, getSettings } from "@/lib/db";
import { buildForecast, fmtUSD } from "@/lib/forecast";
import { AGENTS, AgentProfile } from "@/lib/agents";
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
          body: `The budget is ${fmtUSD(-forecast.remainingBalance)} short. Open Penny's budget to trim events or adjust recruitment scenarios before money is committed.`,
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
            cta: "Open Penny's overview",
            href: "/agents/budgeting",
          };

  const penny = AGENTS[0];

  return (
    <AppShell chapterName={user.chapter_name}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Hero */}
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            SimpleDues Agents
          </p>
          <h1 className="mt-2 font-display text-3xl text-foreground sm:text-4xl">
            Meet the team that runs your money
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Four specialists, one job each. They watch the numbers, prepare
            actions, and ask before anything risky happens. Tap a face to step
            into their office.
          </p>
        </div>

        {/* The humans, up top */}
        <nav className="mt-6 flex items-stretch gap-2 overflow-x-auto rounded-[1.5rem] border border-border bg-card p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {AGENTS.map((agent) => (
            <Link
              key={agent.slug}
              href={`/agents/${agent.slug}`}
              className="group flex min-w-44 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted"
            >
              <span className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border border-border">
                <Image
                  src={agent.image}
                  alt={`${agent.name}, ${agent.role} agent`}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  {agent.name}
                  {agent.status === "active" ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Active" />
                  ) : (
                    <Clock3 className="h-3 w-3 text-muted-foreground/70" />
                  )}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {agent.role}
                </span>
              </span>
              <ArrowRight className="ml-auto h-4 w-4 flex-shrink-0 text-muted-foreground/0 transition-colors group-hover:text-primary" />
            </Link>
          ))}
        </nav>

        {/* Numbers + next action */}
        <section className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <div className="grid gap-3 sm:grid-cols-3">
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

          <div className="rounded-[2rem] border border-border bg-foreground p-6 text-background shadow-sm sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-background/60">
                Penny · Next action
              </p>
              <span className="relative h-8 w-8 overflow-hidden rounded-full border border-background/30">
                <Image
                  src={penny.image}
                  alt="Penny"
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              </span>
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

        {/* Agent cards */}
        <section className="mt-10">
          <div className="mb-4">
            <h2 className="font-display text-2xl text-foreground">The team</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Penny is on the clock today; the other three are being prepared.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {AGENTS.map((agent) => (
              <AgentCard key={agent.slug} agent={agent} />
            ))}
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
  icon: typeof Wallet;
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

function AgentCard({ agent }: { agent: AgentProfile }) {
  return (
    <Link
      href={`/agents/${agent.slug}`}
      className="group rounded-[1.5rem] border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl border border-border">
            <Image
              src={agent.image}
              alt={`${agent.name}, ${agent.role} agent`}
              fill
              sizes="56px"
              className="object-cover"
            />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">
              {agent.name}
              <span className="text-muted-foreground"> · {agent.role}</span>
            </h3>
            <p className="mt-0.5 text-xs font-medium text-muted-foreground">
              {agent.subtabs.join(" · ")}
            </p>
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{agent.description}</p>
      <div className="mt-5 flex items-center justify-between gap-3 text-sm font-semibold">
        <span className="text-muted-foreground">
          {agent.status === "active" ? "On the clock — open now" : "In preparation"}
        </span>
        <ArrowRight
          className={`h-4 w-4 ${agent.status === "active" ? "text-primary" : "text-muted-foreground/60"} transition-transform group-hover:translate-x-0.5`}
        />
      </div>
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
