import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BellRing, Bot, Users, Wallet } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BudgetItemRow, getActivePeriod, getBudgetItems, getCategoryCaps, getMembers, PeriodRow } from "@/lib/db";
import { buildForecast, Forecast, fmtUSD, fmtDate, itemSemesterCost, Insight } from "@/lib/forecast";
import { buildCashCurve, monthlyFlows } from "@/lib/cashflow";
import { CashCurveChart, MonthlyFlowChart } from "@/components/Charts";
import { getAgent } from "@/lib/agents";
import AppShell from "@/components/AppShell";

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/New_York",
    }).format(new Date())
  );
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireOnboardedUser();
  const period = getActivePeriod(user.id);
  if (!period) redirect("/periods");
  const settings = period;
  const items = getBudgetItems(user.id, period.id);
  const members = getMembers(user.id, period.id);
  const caps = getCategoryCaps(user.id, period.id);
  const forecast = buildForecast(settings, items, caps);
  const curve = buildCashCurve(settings, items);
  const months = monthlyFlows(settings, items);
  const penny = getAgent("budgeting")!;

  const available = settings.starting_balance + forecast.totalIncome;
  const upcoming = items
    .filter((i) => i.date)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
  const duesOutstanding = forecast.outstandingDues > 0;

  // Penny's single most useful suggestion right now.
  const nextAction =
    forecast.remainingBalance < 0
      ? {
          title: "Your plans exceed projected funds",
          body: `The budget is ${fmtUSD(-forecast.remainingBalance)} short. Trim events or adjust recruitment scenarios before money is committed.`,
          cta: "Review the budget",
          href: "/budget",
        }
      : duesOutstanding
        ? {
            title: "Dues are still outstanding",
            body: `${fmtUSD(forecast.outstandingDues)} in dues is still projected to come in. Open the roster to reach members for a reminder.`,
            cta: "Open member roster",
            href: "/members",
          }
        : {
            title: "You're on track",
            body: `All plans are covered with ${fmtUSD(forecast.remainingBalance)} projected to spare at semester's end.`,
            cta: "Stress-test scenarios",
            href: "/scenarios",
          };

  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {/* Greeting */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl text-foreground sm:text-4xl">
              {greeting()},{" "}
              <span className="text-primary">{user.chapter_name}</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {period.name} · {fmtDate(settings.semester_start)} –{" "}
              {fmtDate(settings.semester_end)} · Penny keeps these numbers live.
            </p>
          </div>
          <Link
            href="/budget"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Open the budget
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Key numbers + Penny's next action */}
        <section className="mb-8 grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
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
              label="Projected revenue"
              value={fmtUSD(forecast.totalIncome)}
              icon={Wallet}
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

        {/* Charts */}
        {curve && (
          <section className="mb-8 grid gap-6 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-foreground">Cash Through the Semester</h3>
                <span
                  className={`text-sm font-semibold ${
                    curve.min.balance < 0 ? "text-destructive" : "text-primary"
                  }`}
                >
                  {curve.min.balance < 0
                    ? `dips ${fmtUSD(-curve.min.balance)} below zero`
                    : "stays above zero"}
                </span>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Projected balance week by week —{" "}
                {{
                  upfront: "dues arrive at semester start",
                  monthly: "dues arrive in monthly installments",
                  thirds: "dues arrive as a ⅓ deposit plus two installments",
                }[settings.dues_schedule] ?? "dues arrive over the first six weeks"}
                , expenses hit on their dates
              </p>
              <CashCurveChart curve={curve} reserveTarget={settings.reserve_target} />
            </div>
            <div className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-1 font-semibold text-foreground">In vs Out, Monthly</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Where the semester&apos;s money moves
              </p>
              <MonthlyFlowChart months={months} />
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            {/* Budget status */}
            <section className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground">Budget Status</h3>
              <p className="mb-5 mt-1 text-sm text-muted-foreground">
                Where {fmtUSD(available)} of projected funds is going
              </p>
              <div className="space-y-4">
                <StatusBar
                  label="Fixed Obligations"
                  amount={forecast.fixedObligations}
                  total={available}
                  color="bg-amber-500"
                />
                <StatusBar
                  label="Planned Events"
                  amount={forecast.plannedEvents}
                  total={available}
                  color="bg-primary/70"
                />
                <StatusBar
                  label="Remaining Funds"
                  amount={Math.max(0, forecast.remainingBalance)}
                  total={available}
                  color="bg-primary"
                />
                {settings.reserve_target > 0 && (
                  <StatusBar
                    label="Reserve Target"
                    amount={settings.reserve_target}
                    total={available}
                    color="bg-muted-foreground/40"
                  />
                )}
              </div>
              {items.length === 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  No obligations or events yet.{" "}
                  <Link href="/budget" className="font-medium text-primary hover:underline">
                    Build your budget →
                  </Link>
                </p>
              )}
            </section>

            {/* Upcoming commitments */}
            <section className="rounded-2xl border border-border bg-card p-6">
              <h3 className="mb-5 font-semibold text-foreground">Upcoming Commitments</h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled yet. Add dated obligations and events on the{" "}
                  <Link href="/budget" className="font-medium text-primary hover:underline">
                    Budget tab
                  </Link>
                  .
                </p>
              ) : (
                <ol className="relative ml-2 space-y-5 border-l border-border">
                  {upcoming.map((item) => (
                    <li key={item.id} className="ml-5">
                      <span
                        className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${
                          item.type === "fixed_expense"
                            ? "bg-amber-500"
                            : item.type === "other_income"
                              ? "bg-primary"
                              : "bg-foreground/70"
                        }`}
                      />
                      <div className="flex items-baseline justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDate(item.date)} · {item.category}
                            {item.frequency === "monthly" && " · monthly"}
                          </p>
                        </div>
                        <p
                          className={`whitespace-nowrap text-sm font-semibold ${
                            item.type === "other_income" ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {item.type === "other_income" ? "+" : ""}
                          {fmtUSD(item.amount)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <div className="space-y-6 lg:col-span-2">
            {/* Agent briefing */}
            <section className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-5 flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-foreground">Penny&apos;s Briefing</h3>
              </div>
              <div className="space-y-3">
                {forecast.insights.map((insight, i) => (
                  <InsightCard key={i} insight={insight} />
                ))}
              </div>
            </section>

            {/* Scenario peek */}
            <section className="rounded-2xl border border-border bg-card p-6">
              <h3 className="font-semibold text-foreground">Recruitment Scenarios</h3>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                End-of-semester balance by pledge class size
              </p>
              <div className="space-y-2">
                {forecast.scenarios.map((sc) => (
                  <div
                    key={sc.label}
                    className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5"
                  >
                    <span className="text-sm text-muted-foreground">
                      {sc.label}{" "}
                      <span className="text-muted-foreground/60">
                        ({sc.pledgeCount} pledges)
                      </span>
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        sc.remainingBalance >= 0 ? "text-primary" : "text-destructive"
                      }`}
                    >
                      {fmtUSD(sc.remainingBalance)}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/scenarios"
                className="mt-4 block text-sm font-medium text-primary hover:underline"
              >
                Stress-test scenarios →
              </Link>
            </section>

            {/* Dues transparency */}
            {settings.active_dues > 0 && forecast.totalIncome > 0 && (
              <section className="rounded-2xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground">
                  Where a Member&apos;s Dues Go
                </h3>
                <p className="mb-4 mt-1 text-sm text-muted-foreground">
                  Each active&apos;s {fmtUSD(settings.active_dues)}, split the
                  way the semester&apos;s money is planned — paste it in the
                  chapter group chat.
                </p>
                <DuesBreakdown settings={settings} items={items} forecast={forecast} />
              </section>
            )}
          </div>
        </div>
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

function StatusBar({
  label,
  amount,
  total,
  color,
}: {
  label: string;
  amount: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.min(100, (amount / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-foreground">
          {fmtUSD(amount)}
          <span className="font-normal text-muted-foreground"> · {Math.round(pct)}%</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const INSIGHT_STYLES: Record<Insight["tone"], string> = {
  good: "bg-primary/10 text-accent-foreground",
  warn: "bg-amber-500/10 text-amber-800",
  bad: "bg-destructive/10 text-destructive",
  info: "bg-muted text-foreground/80",
};

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className={`rounded-xl px-4 py-3 text-sm leading-6 ${INSIGHT_STYLES[insight.tone]}`}>
      {insight.text}
    </div>
  );
}


function DuesBreakdown({
  settings,
  items,
  forecast,
}: {
  settings: PeriodRow;
  items: BudgetItemRow[];
  forecast: Forecast;
}) {
  const pool = settings.starting_balance + forecast.totalIncome;
  if (pool <= 0) return null;

  const byCategory = new Map<string, number>();
  for (const i of items) {
    if (i.type === "other_income") continue;
    byCategory.set(
      i.category,
      (byCategory.get(i.category) ?? 0) + itemSemesterCost(i, settings)
    );
  }
  const dues = settings.active_dues;
  const rows = Array.from(byCategory.entries())
    .map(([category, spend]) => ({ category, share: (spend / pool) * dues }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 6);
  const allocated = rows.reduce((s, r) => s + r.share, 0);
  const surplus = Math.max(0, dues - allocated);
  const maxShare = Math.max(...rows.map((r) => r.share), surplus, 1);

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <DuesRow key={r.category} label={r.category} amount={r.share} max={maxShare} />
      ))}
      <DuesRow
        label={forecast.remainingBalance >= 0 ? "Kept as reserve / cushion" : "Not covered by plans"}
        amount={surplus}
        max={maxShare}
        muted
      />
    </div>
  );
}

function DuesRow({
  label,
  amount,
  max,
  muted,
}: {
  label: string;
  amount: number;
  max: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 truncate text-sm text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${muted ? "bg-muted-foreground/40" : "bg-primary"}`}
          style={{ width: `${Math.max(2, (amount / max) * 100)}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-sm font-medium text-foreground">
        {fmtUSD(amount)}
      </span>
    </div>
  );
}
