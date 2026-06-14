import { requireOnboardedUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getActivePeriod, getBudgetItems, getCategoryCaps } from "@/lib/db";
import AppShell from "@/components/AppShell";
import Workbench from "./Workbench";

export default async function BudgetPage() {
  const user = await requireOnboardedUser();
  const period = getActivePeriod(user.id);
  if (!period) redirect("/periods");
  const caps = getCategoryCaps(user.id, period.id);
  // The Budget page is the PLAN. Drop any recorded actuals so every total
  // reflects the planned amounts — actuals live on the Plan vs Actual page.
  const plannedItems = getBudgetItems(user.id, period.id).map((i) => ({
    ...i,
    actual_amount: null,
  }));

  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-1 font-display text-3xl text-foreground">
          Budget
          <span className="text-muted-foreground"> · {period.name}</span>
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Plan the whole semester up front — income, obligations, events, and
          allocations. Track what things really cost on{" "}
          <a href="/actuals" className="font-medium text-primary hover:underline">
            Plan vs Actual
          </a>
          .
        </p>
        {/* key on period.id forces a remount when the active period changes,
            so the auto-saving Money In state can never carry a prior period's
            values into the newly-active one. */}
        <Workbench key={period.id} settings={period} items={plannedItems} caps={caps} />
      </div>
    </AppShell>
  );
}
