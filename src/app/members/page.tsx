import { requireOnboardedUser } from "@/lib/auth";
import { getMembers, getSettings } from "@/lib/db";
import AppNav from "@/components/AppNav";
import Roster from "./Roster";

export default async function MembersPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;
  const members = getMembers(user.id);

  return (
    <>
      <AppNav chapterName={user.chapter_name} />
      <Roster members={members} settings={settings} />
    </>
  );
}
