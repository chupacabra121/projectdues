import { requireOnboardedUser } from "@/lib/auth";
import { getMembers, getSettings } from "@/lib/db";
import AppShell from "@/components/AppShell";
import Roster from "./Roster";

export default async function MembersPage() {
  const user = await requireOnboardedUser();
  const settings = getSettings(user.id)!;
  const members = getMembers(user.id);

  return (
    <AppShell chapterName={user.chapter_name}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-2 font-display text-3xl text-foreground">Members</h1>
        <Roster members={members} settings={settings} />
      </div>
    </AppShell>
  );
}
