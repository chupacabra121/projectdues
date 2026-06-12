import { requireOnboardedUser } from "@/lib/auth";
import { getBudgetItems, getCategoryCaps, getSettings } from "@/lib/db";
import AppShell from "@/components/AppShell";
import Workbench from "./Workbench";

export default async function BudgetPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;
  const items = getBudgetItems(user.id);
  const caps = getCategoryCaps(user.id);

  return (
    <AppShell chapterName={user.chapter_name}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-2 font-display text-3xl text-foreground">Budget</h1>
        <Workbench settings={settings} items={items} caps={caps} />
      </div>
    </AppShell>
  );
}
