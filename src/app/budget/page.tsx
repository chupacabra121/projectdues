import { requireOnboardedUser } from "@/lib/auth";
import { getBudgetItems, getSettings } from "@/lib/db";
import AppNav from "@/components/AppNav";
import Workbench from "./Workbench";

export default async function BudgetPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;
  const items = getBudgetItems(user.id);

  return (
    <>
      <AppNav chapterName={user.chapter_name} />
      <Workbench settings={settings} items={items} />
    </>
  );
}
