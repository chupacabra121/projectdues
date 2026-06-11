import { requireOnboardedUser } from "@/lib/auth";
import { getBudgetItems, getSettings, BudgetItemRow } from "@/lib/db";
import {
  buildForecast,
  fmtUSD,
  fmtDate,
  itemSemesterCost,
  occurrences,
} from "@/lib/forecast";
import AppNav from "@/components/AppNav";
import { AddItemForm, CategorySelect, DeleteButton } from "./ItemForms";

export default async function BudgetPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;
  const items = getBudgetItems(user.id);
  const forecast = buildForecast(settings, items);

  const obligations = items.filter((i) => i.type === "fixed_expense");
  const events = items.filter((i) => i.type === "planned_event");

  return (
    <>
      <AppNav chapterName={user.chapter_name} />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="flex items-baseline justify-between mb-2">
          <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
          <p className="text-sm text-gray-500">
            {fmtUSD(forecast.totalCommitted)} committed ·{" "}
            <span className={forecast.remainingBalance >= 0 ? "text-emerald-600" : "text-red-600"}>
              {fmtUSD(forecast.remainingBalance)} projected remaining
            </span>
          </p>
        </div>
        <p className="text-sm text-gray-500 mb-8">
          Two lists: what you <span className="font-medium text-gray-700">must pay</span>, and what
          you <span className="font-medium text-gray-700">want to do</span>.
        </p>

        <div className="grid lg:grid-cols-2 gap-6">
          <BudgetColumn
            title="Fixed Obligations"
            subtitle="Things we must pay"
            total={forecast.fixedObligations}
            items={obligations}
            settings={settings}
            type="fixed_expense"
            accent="amber"
          />
          <BudgetColumn
            title="Planned Events"
            subtitle="Things we want to do"
            total={forecast.plannedEvents}
            items={events}
            settings={settings}
            type="planned_event"
            accent="indigo"
          />
        </div>
      </main>
    </>
  );
}

function BudgetColumn({
  title,
  subtitle,
  total,
  items,
  settings,
  type,
  accent,
}: {
  title: string;
  subtitle: string;
  total: number;
  items: BudgetItemRow[];
  settings: NonNullable<ReturnType<typeof getSettings>>;
  type: "fixed_expense" | "planned_event";
  accent: "amber" | "indigo";
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-semibold">{title}</h2>
        <span className={`text-lg font-semibold ${accent === "amber" ? "text-amber-600" : "text-indigo-600"}`}>
          {fmtUSD(total)}
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-5">{subtitle}</p>

      <div className="space-y-2 mb-4">
        {items.length === 0 && (
          <p className="text-sm text-gray-400 py-3 text-center">
            Nothing here yet.
          </p>
        )}
        {items.map((item) => {
          const n = occurrences(item, settings);
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3 hover:border-gray-200"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <CategorySelect id={item.id} category={item.category} type={type} />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {fmtDate(item.date)}
                  {item.frequency === "monthly" && ` · monthly ×${n}`}
                  {item.frequency === "yearly" && " · yearly"}
                  {item.attendance ? ` · ~${item.attendance} attending` : ""}
                  {item.notes ? ` · ${item.notes}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {fmtUSD(itemSemesterCost(item, settings))}
                  </p>
                  {n > 1 && (
                    <p className="text-xs text-gray-400">{fmtUSD(item.amount)}/mo</p>
                  )}
                </div>
                <DeleteButton id={item.id} />
              </div>
            </div>
          );
        })}
      </div>

      <AddItemForm type={type} />
    </section>
  );
}
