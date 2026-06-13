import { CalendarRange } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import {
  getActivePeriod,
  getDb,
  getPeriods,
  PeriodRow,
} from "@/lib/db";
import { fmtDate, fmtUSD } from "@/lib/forecast";
import AppShell from "@/components/AppShell";
import { CreatePeriodForm, PeriodActions } from "./PeriodControls";

export default async function PeriodsPage() {
  const user = await requireOnboardedUser();
  const periods = getPeriods(user.id);
  const active = getActivePeriod(user.id);

  // Item counts per period, for the list.
  const counts = new Map<number, { items: number; members: number }>();
  const db = getDb();
  for (const p of periods) {
    const items = db
      .prepare("SELECT COUNT(*) AS n FROM budget_items WHERE user_id = ? AND period_id = ?")
      .get(user.id, p.id) as { n: number };
    const members = db
      .prepare("SELECT COUNT(*) AS n FROM members WHERE user_id = ? AND period_id = ?")
      .get(user.id, p.id) as { n: number };
    counts.set(p.id, { items: items.n, members: members.n });
  }

  // Suggest the next semester window after the latest period.
  const latest = periods[0];
  const suggestion = suggestNext(latest);

  return (
    <AppShell chapterName={user.chapter_name} userId={user.id}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarRange className="h-5 w-5" />
          </div>
          <h1 className="font-display text-3xl text-foreground">Budgeting Periods</h1>
        </div>
        <p className="mb-8 max-w-2xl text-sm leading-6 text-muted-foreground">
          Each period is its own semester: a name, a calendar, and its own
          budget, members, and scenarios. Switch periods from the header —
          Penny only ever talks about the one you&apos;re in.
        </p>

        {/* Existing periods */}
        <section className="mb-8 overflow-hidden rounded-[1.5rem] border border-border bg-card">
          {periods.map((p, i) => {
            const isActive = p.id === active?.id;
            const c = counts.get(p.id)!;
            return (
              <div
                key={p.id}
                className={`flex flex-wrap items-center gap-3 px-5 py-4 ${i > 0 ? "border-t border-border/60" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                    {isActive && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtDate(p.semester_start)} – {fmtDate(p.semester_end)} ·{" "}
                    {c.members} members · {c.items} budget items ·{" "}
                    {fmtUSD(revenueOf(p))} projected dues
                  </p>
                </div>
                <PeriodActions
                  id={p.id}
                  name={p.name}
                  isActive={isActive}
                  canDelete={periods.length > 1 && !isActive}
                />
              </div>
            );
          })}
        </section>

        {/* New period */}
        <section className="rounded-[1.5rem] border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground">Start a New Period</h2>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">
            Carry over what recurs every semester; dues collected and actual
            costs always start fresh. The new period becomes active right away.
          </p>
          <CreatePeriodForm
            defaultName={suggestion.name}
            defaultStart={suggestion.start}
            defaultEnd={suggestion.end}
            hasSource={Boolean(active)}
          />
        </section>
      </div>
    </AppShell>
  );
}

function revenueOf(p: PeriodRow): number {
  return (
    (p.active_members * p.active_dues + p.pledges_expected * p.pledge_dues) *
    p.collection_rate
  );
}

/** Propose the semester after the most recent period (fall ↔ spring). */
function suggestNext(latest: PeriodRow | undefined): {
  name: string;
  start: string;
  end: string;
} {
  if (!latest) {
    const y = new Date().getFullYear();
    return { name: `Fall ${y}`, start: `${y}-08-15`, end: `${y}-12-20` };
  }
  const year = Number(latest.semester_start.slice(0, 4));
  const startMonth = Number(latest.semester_start.slice(5, 7));
  if (startMonth >= 6) {
    // fall (or summer) → next spring
    return {
      name: `Spring ${year + 1}`,
      start: `${year + 1}-01-10`,
      end: `${year + 1}-05-15`,
    };
  }
  // spring → fall of the same year
  return { name: `Fall ${year}`, start: `${year}-08-15`, end: `${year}-12-20` };
}
