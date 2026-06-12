import { requireOnboardedUser } from "@/lib/auth";
import { getMembers, getSettings } from "@/lib/db";
import Roster from "./Roster";

export default async function MembersTabPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;
  const members = getMembers(user.id);
  return <Roster members={members} settings={settings} />;
}
