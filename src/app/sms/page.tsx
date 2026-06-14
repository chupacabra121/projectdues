import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { requireOnboardedUser } from "@/lib/auth";
import { getActivePeriod, getMembers } from "@/lib/db";
import SmsComposer from "./SmsComposer";

export default async function DuesCollectionSmsPage() {
  const user = await requireOnboardedUser();
  const period = getActivePeriod(user.id);
  if (!period) redirect("/periods");
  const members = getMembers(user.id, period.id);

  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-1 font-display text-3xl text-foreground">
          Dunn
          <span className="text-muted-foreground"> · SMS · {period.name}</span>
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Compose text reminders from the roster phone numbers already in
          Members.
        </p>
        <SmsComposer
          chapterName={user.chapter_name}
          members={members}
          period={period}
        />
      </div>
    </AppShell>
  );
}
