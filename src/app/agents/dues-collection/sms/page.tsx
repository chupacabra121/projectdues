import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { requireOnboardedUser } from "@/lib/auth";
import { getActivePeriod, getMembers } from "@/lib/db";

export default async function DuesCollectionSmsPage() {
  const user = await requireOnboardedUser();
  const period = getActivePeriod(user.id);
  if (!period) redirect("/periods");
  const members = getMembers(user.id, period.id);
  const reachable = members.filter((m) => m.phone.trim()).length;

  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-1 font-display text-3xl text-foreground">
          Dunn
          <span className="text-muted-foreground"> · SMS · {period.name}</span>
        </h1>
        <section className="rounded-[1.5rem] border border-border bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            SMS queue
          </p>
          <p className="mt-3 text-3xl font-semibold text-foreground">{reachable}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Members with phone numbers are ready for the SMS workflow.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
