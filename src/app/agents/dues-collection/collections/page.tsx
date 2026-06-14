import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import { requireOnboardedUser } from "@/lib/auth";
import { getActivePeriod, getMembers } from "@/lib/db";
import { fmtUSD } from "@/lib/forecast";
import { memberEffectiveDues } from "@/lib/memberDues";

export default async function DuesCollectionCollectionsPage() {
  const user = await requireOnboardedUser();
  const period = getActivePeriod(user.id);
  if (!period) redirect("/periods");
  const members = getMembers(user.id, period.id);
  const billable = members.filter((m) => m.status === "active" || m.status === "pledge");
  const paid = billable.filter((m) => m.dues_paid === 1);
  const openAmount = billable
    .filter((m) => m.dues_paid !== 1)
    .reduce((sum, member) => {
      const setRate = member.status === "pledge" ? period.pledge_dues : period.active_dues;
      return (
        sum +
        memberEffectiveDues(
          member.aid_plan,
          member.aid_amount,
          period.dues_plans,
          setRate
        )
      );
    }, 0);

  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-1 font-display text-3xl text-foreground">
          Dunn
          <span className="text-muted-foreground"> · Collections · {period.name}</span>
        </h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Metric label="Billable members" value={String(billable.length)} />
          <Metric label="Marked paid" value={String(paid.length)} />
          <Metric label="Open dues" value={fmtUSD(openAmount)} />
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </section>
  );
}
