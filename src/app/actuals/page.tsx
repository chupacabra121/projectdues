import { requireOnboardedUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getActivePeriod, getBudgetItems, getMembers } from "@/lib/db";
import AppShell from "@/components/AppShell";
import Actuals from "./Actuals";

export default async function ActualsPage() {
  const user = await requireOnboardedUser();
  const period = getActivePeriod(user.id);
  if (!period) redirect("/periods");
  const items = getBudgetItems(user.id, period.id);
  const members = getMembers(user.id, period.id);

  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-1 font-display text-3xl text-foreground">
          Plan vs Actual
          <span className="text-muted-foreground"> · {period.name}</span>
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          As the semester unfolds, record what things really cost and watch the
          variance against the plan you set on{" "}
          <a href="/budget" className="font-medium text-primary hover:underline">
            Budget
          </a>
          .
        </p>
        {/* Remount on period change so inline actual inputs reset cleanly. */}
        <Actuals key={period.id} period={period} items={items} members={members} />
      </div>
    </AppShell>
  );
}
