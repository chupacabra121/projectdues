import { requireOnboardedUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getActivePeriod, getBudgetItems, getCategoryCaps } from "@/lib/db";
import AppShell from "@/components/AppShell";
import Workbench from "./Workbench";

export default async function BudgetPage() {
  const user = await requireOnboardedUser();
  const period = getActivePeriod(user.id);
  if (!period) redirect("/periods");
  const items = getBudgetItems(user.id, period.id);
  const caps = getCategoryCaps(user.id, period.id);

  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-2 font-display text-3xl text-foreground">
          Budget
          <span className="text-muted-foreground"> · {period.name}</span>
        </h1>
        {/* key on period.id forces a remount when the active period changes,
            so the auto-saving Money In state can never carry a prior period's
            values into the newly-active one. */}
        <Workbench key={period.id} settings={period} items={items} caps={caps} />
      </div>
    </AppShell>
  );
}
