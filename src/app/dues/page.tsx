import { requireOnboardedUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getActivePeriod, getMembers } from "@/lib/db";
import AppShell from "@/components/AppShell";
import DuesBoard from "./DuesBoard";

export default async function DuesPage() {
  const user = await requireOnboardedUser();
  const period = getActivePeriod(user.id);
  if (!period) redirect("/periods");
  const members = getMembers(user.id, period.id);

  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-1 font-display text-3xl text-foreground">
          Dues
          <span className="text-muted-foreground"> · {period.name}</span>
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Who pays what, drawn from your member roster. Most pay the set rate;
          financial-aid members go on a plan with their own amount. Changes here
          feed straight into the budget forecast.
        </p>
        <DuesBoard key={period.id} members={members} period={period} />
      </div>
    </AppShell>
  );
}
