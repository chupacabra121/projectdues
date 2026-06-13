import { requireOnboardedUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getActivePeriod, getMembers } from "@/lib/db";
import AppShell from "@/components/AppShell";
import Roster from "./Roster";

export default async function MembersPage() {
  const user = await requireOnboardedUser();
  const period = getActivePeriod(user.id);
  if (!period) redirect("/periods");
  const members = getMembers(user.id, period.id);

  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-2 font-display text-3xl text-foreground">
          Members
          <span className="text-muted-foreground"> · {period.name}</span>
        </h1>
        <Roster key={period.id} members={members} settings={period} />
      </div>
    </AppShell>
  );
}
