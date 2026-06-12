import Link from "next/link";
import { Bot } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { getBudgetItems, getSettings } from "@/lib/db";
import { buildForecast, fmtUSD, fmtDate, Insight } from "@/lib/forecast";

export default async function BudgetingOverviewPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;
  const items = getBudgetItems(user.id);
  const forecast = buildForecast(settings, items);

  const available = settings.starting_balance + forecast.totalIncome;
  const upcoming = items
    .filter((i) => i.date)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          This semester at a glance
        </h2>
        <p className="text-sm text-muted-foreground">
          {fmtDate(settings.semester_start)} – {fmtDate(settings.semester_end)}
        </p>
      </div>

      {/* Financial health */}
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <HealthCard
          label="Projected Revenue"
          value={fmtUSD(forecast.totalIncome)}
          sub={
            forecast.otherIncome > 0
              ? `${fmtUSD(forecast.projectedRevenue)} dues + ${fmtUSD(forecast.otherIncome)} other income`
              : `${settings.active_members} actives + ${settings.pledges_expected} expected pledges`
          }
        />
        <HealthCard
          label="Outstanding Dues"
          value={fmtUSD(forecast.outstandingDues)}
          sub={`${fmtUSD(settings.dues_collected)} collected so far`}
        />
        <HealthCard
          label="Fixed Obligations"
          value={fmtUSD(forecast.fixedObligations)}
          sub={`${items.filter((i) => i.type === "fixed_expense").length} obligations`}
        />
        <HealthCard
          label="End-of-Semester Balance"
          value={fmtUSD(forecast.remainingBalance)}
          sub={forecast.remainingBalance >= 0 ? "Projected surplus" : "Projected deficit"}
          tone={forecast.remainingBalance >= 0 ? "good" : "bad"}
        />
      </section>

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
                <Link
                  href="/agents/budgeting/budget"
                  className="font-medium text-primary hover:underline"
                >
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
                <Link
                  href="/agents/budgeting/budget"
                  className="font-medium text-primary hover:underline"
                >
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
              <h3 className="font-semibold text-foreground">Agent Briefing</h3>
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
              href="/agents/budgeting/scenarios"
              className="mt-4 block text-sm font-medium text-primary hover:underline"
            >
              Stress-test scenarios →
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}

function HealthCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-semibold ${
          tone === "good"
            ? "text-primary"
            : tone === "bad"
              ? "text-destructive"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
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
