import { requireOnboardedUser } from "@/lib/auth";
import { getBudgetItems, getSettings } from "@/lib/db";
import { buildForecast, fmtUSD, fmtDate, Insight } from "@/lib/forecast";
import AppNav from "@/components/AppNav";
import Link from "next/link";

export default async function DashboardPage() {
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
      <AppNav chapterName={user.chapter_name} />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            This Semester at a Glance
          </h1>
          <p className="text-sm text-gray-500">
            {fmtDate(settings.semester_start)} – {fmtDate(settings.semester_end)}
          </p>
        </div>

        {/* Financial Health */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            {/* Budget Status */}
            <section className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold mb-1">Budget Status</h2>
              <p className="text-sm text-gray-500 mb-5">
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
                  color="bg-indigo-500"
                />
                <StatusBar
                  label="Remaining Funds"
                  amount={Math.max(0, forecast.remainingBalance)}
                  total={available}
                  color="bg-emerald-500"
                />
                {settings.reserve_target > 0 && (
                  <StatusBar
                    label="Reserve Target"
                    amount={settings.reserve_target}
                    total={available}
                    color="bg-gray-400"
                    marker
                  />
                )}
              </div>
              {items.length === 0 && (
                <p className="text-sm text-gray-500 mt-4">
                  No obligations or events yet.{" "}
                  <Link href="/budget" className="text-indigo-600 font-medium hover:underline">
                    Build your budget →
                  </Link>
                </p>
              )}
            </section>

            {/* Upcoming Commitments */}
            <section className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold mb-5">Upcoming Commitments</h2>
              {upcoming.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Nothing scheduled yet. Add dated obligations and events on the{" "}
                  <Link href="/budget" className="text-indigo-600 font-medium hover:underline">
                    Budget page
                  </Link>
                  .
                </p>
              ) : (
                <ol className="relative border-l border-gray-200 ml-2 space-y-5">
                  {upcoming.map((item) => (
                    <li key={item.id} className="ml-5">
                      <span
                        className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${
                          item.type === "fixed_expense"
                            ? "bg-amber-500"
                            : item.type === "other_income"
                              ? "bg-emerald-500"
                              : "bg-indigo-500"
                        }`}
                      />
                      <div className="flex items-baseline justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            {fmtDate(item.date)} · {item.category}
                            {item.frequency === "monthly" && " · monthly"}
                          </p>
                        </div>
                        <p
                          className={`text-sm font-semibold whitespace-nowrap ${
                            item.type === "other_income" ? "text-emerald-600" : ""
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

          <div className="lg:col-span-2 space-y-6">
            {/* Treasurer Insights */}
            <section className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold mb-5">Treasurer Insights</h2>
              <div className="space-y-3">
                {forecast.insights.map((insight, i) => (
                  <InsightCard key={i} insight={insight} />
                ))}
              </div>
            </section>

            {/* Scenario peek */}
            <section className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold mb-1">Recruitment Scenarios</h2>
              <p className="text-sm text-gray-500 mb-4">
                End-of-semester balance by pledge class size
              </p>
              <div className="space-y-2">
                {forecast.scenarios.map((sc) => (
                  <div
                    key={sc.label}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5"
                  >
                    <span className="text-sm text-gray-600">
                      {sc.label}{" "}
                      <span className="text-gray-400">({sc.pledgeCount} pledges)</span>
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        sc.remainingBalance >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {fmtUSD(sc.remainingBalance)}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/scenarios"
                className="block text-sm text-indigo-600 font-medium hover:underline mt-4"
              >
                Adjust scenarios →
              </Link>
            </section>
          </div>
        </div>
      </main>
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
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-xs uppercase tracking-wide text-gray-400 font-medium">{label}</p>
      <p
        className={`text-2xl font-semibold mt-1.5 ${
          tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : ""
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}

function StatusBar({
  label,
  amount,
  total,
  color,
  marker,
}: {
  label: string;
  amount: number;
  total: number;
  color: string;
  marker?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, (amount / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-medium">
          {fmtUSD(amount)}
          <span className="text-gray-400 font-normal"> · {Math.round(pct)}%</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} ${marker ? "opacity-40" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const INSIGHT_STYLES: Record<Insight["tone"], string> = {
  good: "bg-emerald-50 border-emerald-200 text-emerald-900",
  warn: "bg-amber-50 border-amber-200 text-amber-900",
  bad: "bg-red-50 border-red-200 text-red-900",
  info: "bg-sky-50 border-sky-200 text-sky-900",
};

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${INSIGHT_STYLES[insight.tone]}`}>
      {insight.text}
    </div>
  );
}
