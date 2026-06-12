import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { getBudgetItems, getSettings } from "@/lib/db";
import { buildForecast, fmtUSD } from "@/lib/forecast";
import AppShell from "@/components/AppShell";

export default async function ScenariosPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;
  const items = getBudgetItems(user.id);
  const forecast = buildForecast(settings, items);

  return (
    <AppShell chapterName={user.chapter_name}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="mb-2 font-display text-3xl text-foreground">Scenarios</h1>
      <p className="mb-8 max-w-2xl text-sm leading-6 text-muted-foreground">
        Recruitment is the biggest swing factor in your budget. These three
        forecasts share your obligations, events, and dues — only the pledge
        class size changes. Adjust the estimates on the{" "}
        <Link
          href="/budget#money-in"
          className="font-medium text-primary hover:underline"
        >
          Budget tab
        </Link>
        .
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        {forecast.scenarios.map((sc) => {
          const positive = sc.remainingBalance >= 0;
          const isExpected = sc.label === "Expected";
          return (
            <section
              key={sc.label}
              className={`rounded-[1.5rem] border p-6 ${
                isExpected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card"
              }`}
            >
              <p
                className={`text-xs font-medium uppercase tracking-wide ${
                  isExpected ? "text-background/60" : "text-muted-foreground"
                }`}
              >
                {sc.label}
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {sc.pledgeCount}{" "}
                <span
                  className={`text-sm font-normal ${isExpected ? "text-background/60" : "text-muted-foreground"}`}
                >
                  pledges
                </span>
              </p>
              <dl
                className={`mt-4 space-y-2 text-sm ${isExpected ? "text-background/70" : "text-muted-foreground"}`}
              >
                <div className="flex justify-between">
                  <dt>Dues revenue</dt>
                  <dd className="font-medium">{fmtUSD(sc.projectedRevenue)}</dd>
                </div>
                {forecast.otherIncome > 0 && (
                  <div className="flex justify-between">
                    <dt>Other income</dt>
                    <dd className="font-medium">{fmtUSD(forecast.otherIncome)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>Committed</dt>
                  <dd className="font-medium">−{fmtUSD(forecast.totalCommitted)}</dd>
                </div>
                <div
                  className={`flex justify-between border-t pt-2 ${
                    isExpected ? "border-background/20" : "border-border"
                  }`}
                >
                  <dt className="font-medium">End balance</dt>
                  <dd
                    className={`font-semibold ${
                      isExpected
                        ? positive
                          ? "text-emerald-300"
                          : "text-red-300"
                        : positive
                          ? "text-primary"
                          : "text-destructive"
                    }`}
                  >
                    {fmtUSD(sc.remainingBalance)}
                  </dd>
                </div>
              </dl>
            </section>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-3 font-semibold text-foreground">How to read this</h3>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          <li>
            If even the <span className="font-medium text-foreground">Conservative</span>{" "}
            column shows a surplus, your plans are safe regardless of recruitment.
          </li>
          <li>
            If only <span className="font-medium text-foreground">Optimistic</span> is
            positive, your budget depends on a great rush — consider trimming events now.
          </li>
          <li>
            Each pledge is worth{" "}
            <span className="font-medium text-foreground">
              {fmtUSD(settings.pledge_dues * settings.collection_rate)}
            </span>{" "}
            in expected revenue at your current collection rate.
          </li>
        </ul>
      </div>
      </div>
    </AppShell>
  );
}
