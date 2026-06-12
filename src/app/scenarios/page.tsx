import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth";
import { getBudgetItems, getSettings } from "@/lib/db";
import { buildForecast, fmtUSD } from "@/lib/forecast";
import AppNav from "@/components/AppNav";

export default async function ScenariosPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;
  const items = getBudgetItems(user.id);
  const forecast = buildForecast(settings, items);

  return (
    <>
      <AppNav chapterName={user.chapter_name} />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          Scenario Planning
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Recruitment is the biggest swing factor in your budget. These three
          forecasts share your obligations, events, and dues — only the pledge
          class size changes. Adjust the estimates on the{" "}
          <Link href="/budget#money-in" className="text-indigo-600 font-medium hover:underline">
            Budget tab
          </Link>
          .
        </p>

        <div className="grid sm:grid-cols-3 gap-4">
          {forecast.scenarios.map((sc) => {
            const positive = sc.remainingBalance >= 0;
            const isExpected = sc.label === "Expected";
            return (
              <section
                key={sc.label}
                className={`rounded-2xl border p-6 ${
                  isExpected
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white border-gray-200"
                }`}
              >
                <p
                  className={`text-xs uppercase tracking-wide font-medium ${
                    isExpected ? "text-indigo-200" : "text-gray-400"
                  }`}
                >
                  {sc.label}
                </p>
                <p className="text-2xl font-semibold mt-1">
                  {sc.pledgeCount}{" "}
                  <span className={`text-sm font-normal ${isExpected ? "text-indigo-200" : "text-gray-400"}`}>
                    pledges
                  </span>
                </p>
                <dl className={`mt-4 space-y-2 text-sm ${isExpected ? "text-indigo-100" : "text-gray-600"}`}>
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
                      isExpected ? "border-indigo-500" : "border-gray-100"
                    }`}
                  >
                    <dt className="font-medium">End balance</dt>
                    <dd
                      className={`font-semibold ${
                        isExpected
                          ? positive ? "text-emerald-300" : "text-red-300"
                          : positive ? "text-emerald-600" : "text-red-600"
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

        <div className="mt-8 bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="font-semibold mb-3">How to read this</h2>
          <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5">
            <li>
              If even the <span className="font-medium">Conservative</span> column shows a
              surplus, your plans are safe regardless of recruitment.
            </li>
            <li>
              If only <span className="font-medium">Optimistic</span> is positive, your
              budget depends on a great rush — consider trimming events now.
            </li>
            <li>
              Each pledge is worth{" "}
              <span className="font-medium">
                {fmtUSD(settings.pledge_dues * settings.collection_rate)}
              </span>{" "}
              in expected revenue at your current collection rate.
            </li>
          </ul>
        </div>
      </main>
    </>
  );
}
