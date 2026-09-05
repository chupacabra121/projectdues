import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth";
import { getActivePeriod, getBudgetItems } from "@/lib/db";
import {
  buildForecast,
  fmtUSD,
  fmtDate,
  activeDuesGross,
  activeMemberCount,
  brotherCollectionRate,
  pledgeCollectionRate,
  variableObligationsFor,
} from "@/lib/forecast";
import AppShell from "@/components/AppShell";

/**
 * Where each number comes from. The whole point of this page is that a figure
 * you can't trace is a figure you can't defend in a chapter meeting.
 */
type Kind = "input" | "calculated" | "roster";

const KIND_STYLE: Record<Kind, string> = {
  input: "bg-primary/12 text-primary",
  calculated: "bg-muted text-muted-foreground",
  roster: "bg-warning/15 text-warning-foreground",
};
const KIND_LABEL: Record<Kind, string> = {
  input: "input",
  calculated: "calculated",
  roster: "from roster",
};

function Row({
  label,
  value,
  kind,
  note,
  href,
  strong,
}: {
  label: string;
  value: string;
  kind: Kind;
  note?: string;
  href?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border/50 py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${strong ? "font-semibold text-foreground" : "text-foreground"}`}>
          {label}
        </p>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${KIND_STYLE[kind]}`}
      >
        {KIND_LABEL[kind]}
      </span>
      <span
        className={`w-32 shrink-0 text-right font-money tabular-nums ${
          strong ? "text-base font-semibold text-foreground" : "text-sm text-foreground"
        }`}
      >
        {value}
      </span>
      <span className="w-24 shrink-0 text-right text-xs">
        {href ? (
          <Link href={href} className="text-primary hover:underline">
            edit
          </Link>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass mt-5 rounded-[1.25rem] p-5">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default async function AssumptionsPage() {
  const user = await requireOnboardedUser();
  const period = getActivePeriod(user.id);
  if (!period) redirect("/periods");
  const items = getBudgetItems(user.id, period.id);
  const forecast = buildForecast(period, items);

  const bd = period.active_dues_breakdown;
  const onAid = bd?.aid.length ?? 0;
  const fullPay = bd?.fullCount ?? period.active_members;
  const brothers = activeMemberCount(period);
  const bRate = brotherCollectionRate(period);
  const pRate = pledgeCollectionRate(period);
  const gap = forecast.breakEvenRate - forecast.blendedCollectionRate;

  const start = new Date(period.semester_start + "T00:00:00");
  const end = new Date(period.semester_end + "T00:00:00");
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1;

  const otherIncome = forecast.otherIncome;
  const obligations = forecast.fixedObligations + forecast.variableObligations;
  const toWorkWith = period.starting_balance + forecast.totalIncome - obligations;
  const safeToSpend = toWorkWith - period.reserve_target;

  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="mb-2 font-display text-3xl text-foreground">
          Assumptions
          <span className="text-muted-foreground"> · {period.name}</span>
        </h1>
        <p className="mb-1 max-w-2xl text-sm leading-6 text-muted-foreground">
          Every driver behind this budget in one place, and where each one comes
          from. Change an <strong className="font-medium text-primary">input</strong> and
          everything downstream moves; a{" "}
          <strong className="font-medium text-foreground">calculated</strong> figure is
          an output you can&apos;t set directly.
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          This page is a read-only view — the <em>edit</em> links take you to the
          page that owns each number.
        </p>

        <Section title="Calendar">
          <Row label="Semester start" value={fmtDate(period.semester_start)} kind="input" href="/periods" />
          <Row label="Semester end" value={fmtDate(period.semester_end)} kind="input" href="/periods" />
          <Row label="Calendar months in period" value={String(months)} kind="calculated"
            note="How many times a monthly bill lands" />
        </Section>

        <Section title="Membership">
          <Row label="Returning brothers" value={String(brothers)} kind="roster" href="/members"
            note="Counted from the roster, not typed in" />
          <Row label="— of which on financial aid" value={String(onAid)} kind="roster" href="/dues" />
          <Row label="— paying full dues" value={String(fullPay)} kind="calculated" />
          <Row label="New members — expected" value={String(period.pledges_expected)} kind="input" href="/budget#money-in" />
          <Row label="New members — conservative" value={String(period.pledges_conservative)} kind="input" href="/budget#money-in" />
          <Row label="New members — optimistic" value={String(period.pledges_optimistic)} kind="input" href="/budget#money-in" />
          <Row label="Total billable members" value={String(brothers + period.pledges_expected)} kind="calculated" strong />
        </Section>

        <Section title="Dues">
          <Row label="Brother dues, per semester" value={fmtUSD(period.active_dues)} kind="input" href="/budget#money-in" />
          <Row label="New member dues, per semester" value={fmtUSD(period.pledge_dues)} kind="input" href="/budget#money-in" />
          <Row label="Gross brother dues billed" value={fmtUSD(activeDuesGross(period))} kind="calculated"
            note="Full-rate members plus each aid member's own amount" />
          <Row label="Gross dues billed" value={fmtUSD(forecast.grossDuesBilled)} kind="calculated" strong />
        </Section>

        <Section title="Collection">
          <Row label="Brother collection rate" value={pct(bRate)} kind="input" href="/budget#money-in"
            note="Set as a headcount of brothers you expect won't pay" />
          <Row label="New member collection rate" value={pct(pRate)} kind="input" href="/budget#money-in"
            note="Set as a headcount of new members you expect won't pay" />
          <Row label="Blended collection rate" value={pct(forecast.blendedCollectionRate)} kind="calculated"
            note="What the tier mix works out to — an output, never an input" />
          <Row label="Break-even collection rate" value={pct(forecast.breakEvenRate)} kind="calculated" strong
            note="The blended rate that ends the semester at exactly zero" />
          <Row
            label={gap > 0 ? "Short of break-even by" : "Above break-even by"}
            value={`${Math.abs(gap * 100).toFixed(1)} pts`}
            kind="calculated"
            href="/scenarios"
          />
        </Section>

        <Section title="Money">
          <Row label="Starting balance" value={fmtUSD(period.starting_balance)} kind="input" href="/budget#money-in" />
          <Row label="Reserve target" value={fmtUSD(period.reserve_target)} kind="input" href="/budget#money-in"
            note="Carved out of what's spendable, so events can't eat the cushion" />
          <Row label="Other income" value={fmtUSD(otherIncome)} kind="calculated" href="/budget" />
          <Row label="Dues collected so far" value={fmtUSD(period.dues_collected)} kind="roster" href="/dues" />
        </Section>

        <Section title="Costs">
          <Row label="Fixed obligations" value={fmtUSD(forecast.fixedObligations)} kind="calculated" href="/budget" />
          <Row
            label="Variable obligations"
            value={fmtUSD(variableObligationsFor(items, period, period.pledges_expected))}
            kind="calculated"
            href="/budget"
            note="Per-head costs, scaled to the expected pledge class"
          />
          <Row label="Events & discretionary" value={fmtUSD(forecast.plannedEvents)} kind="calculated" href="/budget" />
          <Row label="Total committed" value={fmtUSD(forecast.totalCommitted)} kind="calculated" strong />
        </Section>

        <Section title="Outcome">
          <Row label="Total money in" value={fmtUSD(period.starting_balance + forecast.totalIncome)} kind="calculated" />
          <Row label="To work with" value={fmtUSD(toWorkWith)} kind="calculated" note="After obligations, before the reserve" />
          <Row label="Safe to spend" value={fmtUSD(safeToSpend)} kind="calculated" />
          <Row label="Projected end balance" value={fmtUSD(forecast.remainingBalance)} kind="calculated" strong />
        </Section>
      </div>
    </AppShell>
  );
}
