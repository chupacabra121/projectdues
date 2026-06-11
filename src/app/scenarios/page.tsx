import { requireOnboardedUser } from "@/lib/auth";
import { getBudgetItems, getSettings } from "@/lib/db";
import { buildForecast, fmtUSD } from "@/lib/forecast";
import { updateScenarios } from "@/app/actions/setup";
import AppNav from "@/components/AppNav";
import { inputCls, labelCls } from "@/components/AuthShell";

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
          Recruitment is the biggest swing factor in your budget. Plan for three
          pledge-class sizes and see how each changes your semester.
        </p>

        <section className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold mb-5">Pledge Class Estimates</h2>
          <form action={updateScenarios} className="grid sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className={labelCls}>Conservative</label>
              <input
                name="conservative" type="number" min={0} className={inputCls}
                defaultValue={settings.pledges_conservative}
              />
            </div>
            <div>
              <label className={labelCls}>Expected</label>
              <input
                name="expected" type="number" min={0} className={inputCls}
                defaultValue={settings.pledges_expected}
              />
            </div>
            <div>
              <label className={labelCls}>Optimistic</label>
              <input
                name="optimistic" type="number" min={0} className={inputCls}
                defaultValue={settings.pledges_optimistic}
              />
            </div>
            <button className="rounded-lg bg-indigo-600 text-white py-2 px-4 text-sm font-medium hover:bg-indigo-700">
              Update Forecasts
            </button>
          </form>
        </section>

        <div className="grid sm:grid-cols-3 gap-4">
          {forecast.scenarios.map((sc) => {
            const positive = sc.remainingBalance >= 0;
            return (
              <section
                key={sc.label}
                className={`rounded-2xl border p-6 ${
                  sc.label === "Expected"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white border-gray-200"
                }`}
              >
                <p
                  className={`text-xs uppercase tracking-wide font-medium ${
                    sc.label === "Expected" ? "text-indigo-200" : "text-gray-400"
                  }`}
                >
                  {sc.label}
                </p>
                <p className="text-2xl font-semibold mt-1">
                  {sc.pledgeCount}{" "}
                  <span className={`text-sm font-normal ${sc.label === "Expected" ? "text-indigo-200" : "text-gray-400"}`}>
                    pledges
                  </span>
                </p>
                <dl className={`mt-4 space-y-2 text-sm ${sc.label === "Expected" ? "text-indigo-100" : "text-gray-600"}`}>
                  <div className="flex justify-between">
                    <dt>Revenue</dt>
                    <dd className="font-medium">{fmtUSD(sc.projectedRevenue)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Committed</dt>
                    <dd className="font-medium">−{fmtUSD(forecast.totalCommitted)}</dd>
                  </div>
                  <div
                    className={`flex justify-between border-t pt-2 ${
                      sc.label === "Expected" ? "border-indigo-500" : "border-gray-100"
                    }`}
                  >
                    <dt className="font-medium">End balance</dt>
                    <dd
                      className={`font-semibold ${
                        sc.label === "Expected"
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

        <p className="text-xs text-gray-400 mt-6">
          All scenarios assume the same obligations, events, dues, and collection
          rate — only the pledge class size changes.
        </p>
      </main>
    </>
  );
}
