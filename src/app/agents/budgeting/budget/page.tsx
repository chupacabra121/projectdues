import { requireOnboardedUser } from "@/lib/auth";
import { getBudgetItems, getSettings } from "@/lib/db";
import Workbench from "./Workbench";

export default async function BudgetTabPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;
  const items = getBudgetItems(user.id);
  return <Workbench settings={settings} items={items} />;
}
