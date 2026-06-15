"use client";

import { useState, useTransition } from "react";
import { setActualAmount, setBillPaid } from "@/app/actions/budget";
import { BudgetItemRow, MemberRow, PeriodRow } from "@/lib/db";
import { buildForecast, fmtUSD, fmtDate, occurrences, effectiveAmount } from "@/lib/forecast";
import { memberDuesWithTags, memberTier, isBillableMember } from "@/lib/memberDues";

export default function Actuals({
  period,
  items,
  members,
  todayIso,
}: {
  period: PeriodRow;
  items: BudgetItemRow[];
  members: MemberRow[];
  todayIso: string;
}) {
  // Events are where plan and actual actually diverge — a formal runs over, an
  // extra mixer gets added. Fixed obligations bill at a set amount and per-member
  // costs are predictable (rate × headcount), so neither is tracked line-by-line.
  const events = items.filter((i) => i.type === "planned_event");
  const otherIncome = items.filter((i) => i.type === "other_income");

  // Planned vs actual on the spending side, computed on semester totals.
  const recorded = events.filter((i) => i.actual_amount != null);
  const actualRecorded = recorded.reduce(
    (s, i) => s + i.actual_amount! * occurrences(i, period),
    0
  );
  const plannedForRecorded = recorded.reduce(
    (s, i) => s + i.amount * occurrences(i, period),
    0
  );
  const spendVariance = actualRecorded - plannedForRecorded;

  // Bills due vs paid — the fixed obligations (national fees, insurance, …).
  // Unpaid sort to the top, soonest/overdue first; paid drop to the bottom.
  const bills = items.filter((i) => i.type === "fixed_expense");
  // Effective = the recorded actual once known, else the plan — so a national
  // invoice that comes in high updates Total Due / Outstanding immediately.
  const billCost = (i: BudgetItemRow) => effectiveAmount(i) * occurrences(i, period);
  const billsTotal = bills.reduce((s, i) => s + billCost(i), 0);
  const billsPaid = bills
    .filter((i) => i.paid === 1)
    .reduce((s, i) => s + billCost(i), 0);
  const billsOutstanding = Math.max(0, billsTotal - billsPaid);
  const nextBill =
    bills
      .filter((i) => i.paid !== 1 && i.date)
      .sort((a, b) => (a.date! < b.date! ? -1 : 1))[0] ?? null;
  const unpaidCount = bills.filter((i) => i.paid !== 1).length;
  const sortedBills = [...bills].sort((a, b) => {
    if ((a.paid === 1) !== (b.paid === 1)) return a.paid === 1 ? 1 : -1;
    if (!a.date) return b.date ? 1 : 0;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });

  // Income side: billed (full roster obligation) vs collected (paid checkboxes).
  const duesOf = (m: MemberRow) =>
    memberDuesWithTags(
      m.status,
      m.tags,
      period.custom_categories,
      m.aid_plan,
      m.aid_amount,
      period.dues_plans,
      period.active_dues,
      period.pledge_dues
    );
  // Billable = brothers, pledges, and anyone in a promoted tier (e.g. a
  // dues-paying alumnus). Tier members are billed but counted under their tier.
  const tierOf = (m: MemberRow) => memberTier(m.tags, period.custom_categories);
  const dueMembers = members.filter((m) =>
    isBillableMember(m.status, m.tags, period.custom_categories)
  );
  const brotherMembers = members.filter((m) => m.status === "brother" && !tierOf(m));
  const pledgeMembers = members.filter((m) => m.status === "pledge" && !tierOf(m));
  const tierMembers = members.filter((m) => m.status !== "trash" && tierOf(m) != null);
  const billed = dueMembers.reduce((s, m) => s + duesOf(m), 0);
  const collected = dueMembers
    .filter((m) => m.dues_paid === 1)
    .reduce((s, m) => s + duesOf(m), 0);
  const outstanding = Math.max(0, billed - collected);
  const paidCount = dueMembers.filter((m) => m.dues_paid === 1).length;
  const unpaid = dueMembers
    .filter((m) => m.dues_paid !== 1 && duesOf(m) > 0)
    .map((m) => ({
      id: m.id,
      name: m.name,
      label: tierOf(m)?.plural ?? tierOf(m)?.name ?? (m.status === "pledge" ? "pledge" : "brother"),
      amount: duesOf(m),
    }))
    .sort((a, b) => b.amount - a.amount);
  const actualCollectedPct = billed > 0 ? Math.round((collected / billed) * 100) : 0;
  const plannedCollectionPct = Math.round(period.collection_rate * 100);

  // Projected end balance two ways: actual-adjusted (matches the dashboard)
  // and the original plan.
  const effective = buildForecast(period, items);
  const planned = buildForecast(
    period,
    items.map((i) => ({ ...i, actual_amount: null }))
  );

  return (
    <>
      {/* Summary */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Event Spending Recorded"
          value={fmtUSD(actualRecorded)}
          sub={
            recorded.length === 0
              ? `0 of ${events.length} events recorded`
              : `${recorded.length} of ${events.length} events · ${spendVariance >= 0 ? "+" : "−"}${fmtUSD(Math.abs(spendVariance))} vs plan`
          }
          tone={
            recorded.length === 0
              ? undefined
              : spendVariance > 0
                ? "bad"
                : "good"
          }
        />
        <SummaryCard
          label="Dues Collected"
          value={fmtUSD(collected)}
          sub={`${paidCount} of ${dueMembers.length} paid · ${fmtUSD(outstanding)} outstanding`}
          tone="good"
        />
        <SummaryCard
          label="Projected End Balance"
          value={fmtUSD(effective.remainingBalance)}
          sub={`vs ${fmtUSD(planned.remainingBalance)} planned`}
          tone={effective.remainingBalance >= 0 ? "good" : "bad"}
        />
      </section>

      {/* Events — planned vs actual */}
      <section className="glass mb-6 overflow-hidden rounded-[1.5rem]">
        <div className="border-b border-border/60 px-6 pb-4 pt-6">
          <h2 className="font-semibold text-foreground">Events — planned vs actual</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Record what each event really cost — the formal that ran over, the
            mixer you added. Penny rolls the variance into your forecast and
            dashboard. Fixed bills don&apos;t vary, so they stay on the Budget.
          </p>
        </div>

        <div className="hidden grid-cols-[1.6fr_1fr_1fr_6.5rem] gap-3 px-6 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Item</span>
          <span className="text-right">Planned</span>
          <span>Actual</span>
          <span className="text-right">Variance</span>
        </div>

        {events.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground/70">
            No events yet — plan them on the Budget tab first.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {events.map((item) => (
              <ExpenseRow key={item.id} item={item} period={period} />
            ))}
          </div>
        )}
      </section>

      {/* Bills — due vs paid (the fixed obligations: national fees, insurance…) */}
      {bills.length > 0 && (
        <section className="glass mb-6 overflow-hidden rounded-[1.5rem]">
          <div className="border-b border-border/60 px-6 pb-4 pt-6">
            <h2 className="font-semibold text-foreground">Bills — due vs paid</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your fixed obligations, sorted by what&apos;s due next. Check each
              one off as you clear it with HQ.
            </p>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60">
            <Stat
              label="Total Due"
              value={fmtUSD(billsTotal)}
              sub={`${bills.length} bill${bills.length === 1 ? "" : "s"}`}
            />
            <Stat
              label="Paid"
              value={fmtUSD(billsPaid)}
              sub={`${bills.length - unpaidCount} of ${bills.length} cleared`}
              tone="good"
            />
            <Stat
              label="Outstanding"
              value={fmtUSD(billsOutstanding)}
              sub={
                nextBill
                  ? `next: ${nextBill.name} · ${billStatus(nextBill.date, false, todayIso).label}`
                  : unpaidCount === 0
                    ? "all paid 🎉"
                    : `${unpaidCount} unpaid`
              }
              tone={billsOutstanding > 0 ? "bad" : "good"}
            />
          </div>

          <div className="hidden grid-cols-[1.5rem_1.7fr_1fr_1fr] gap-3 px-6 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span />
            <span>Bill</span>
            <span>Status</span>
            <span className="text-right">Amount</span>
          </div>
          <div className="divide-y divide-border/40">
            {sortedBills.map((item) => (
              <BillRow key={item.id} item={item} period={period} todayIso={todayIso} />
            ))}
          </div>
        </section>
      )}

      {/* Dues — billed vs collected (from the per-member paid checkboxes) */}
      <section className="glass mb-6 overflow-hidden rounded-[1.5rem]">
        <div className="border-b border-border/60 px-6 pb-4 pt-6">
          <h2 className="font-semibold text-foreground">Dues — billed vs collected</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Billed is what everyone on the roster owes; collected comes from the
            paid checkboxes on the{" "}
            <a href="/dues" className="font-medium text-primary hover:underline">Dues</a>{" "}
            tab. Check members off there and this updates live.
          </p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-border/60 border-b border-border/60">
          <Stat
            label="Billed"
            value={fmtUSD(billed)}
            sub={`${brotherMembers.length} brothers + ${pledgeMembers.length} pledges${
              tierMembers.length ? ` + ${tierMembers.length} tier` : ""
            }`}
          />
          <Stat label="Collected" value={fmtUSD(collected)} sub={`${actualCollectedPct}% of billed`} tone="good" />
          <Stat
            label="Outstanding"
            value={fmtUSD(outstanding)}
            sub={`${unpaid.length} unpaid`}
            tone={outstanding > 0 ? "bad" : "good"}
          />
        </div>

        <div className="space-y-2 border-b border-border/60 px-6 py-4 text-sm">
          <CompareLine
            label="Collection rate"
            plan={`${plannedCollectionPct}% assumed`}
            actual={`${actualCollectedPct}% so far`}
            good={actualCollectedPct >= plannedCollectionPct}
          />
          <CompareLine
            label="Pledges"
            plan={`${period.pledges_expected} expected`}
            actual={`${pledgeMembers.length} on roster`}
            good={pledgeMembers.length >= period.pledges_expected}
          />
        </div>

        <div className="px-6 py-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Who still owes
          </p>
          {unpaid.length === 0 ? (
            <p className="text-sm text-muted-foreground/70">
              {dueMembers.length === 0
                ? "No dues-paying members on the roster yet."
                : "Everyone's paid up. 🎉"}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {unpaid.slice(0, 12).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-foreground">
                    {m.name}
                    <span className="ml-2 text-xs text-muted-foreground">{m.label}</span>
                  </span>
                  <span className="font-money font-medium text-money-down">{fmtUSD(m.amount)}</span>
                </li>
              ))}
              {unpaid.length > 12 && (
                <li className="pt-1 text-xs text-muted-foreground">
                  +{unpaid.length - 12} more
                </li>
              )}
            </ul>
          )}
        </div>
      </section>

      {/* Other income — planned vs actual */}
      {otherIncome.length > 0 && (
        <section className="glass overflow-hidden rounded-[1.5rem]">
          <div className="border-b border-border/60 px-6 pb-4 pt-6">
            <h2 className="font-semibold text-foreground">Other income — planned vs actual</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Fundraisers, donations, and university allocations.
            </p>
          </div>
          <div className="hidden grid-cols-[1.6fr_1fr_1fr_6.5rem] gap-3 px-6 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Item</span>
            <span className="text-right">Planned</span>
            <span>Actual</span>
            <span className="text-right">Variance</span>
          </div>
          <div className="divide-y divide-border/40">
            {otherIncome.map((item) => (
              <ExpenseRow key={item.id} item={item} period={period} income />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="px-6 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`font-money mt-1 text-xl font-semibold ${
          tone === "good" ? "text-money-up" : tone === "bad" ? "text-money-down" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function CompareLine({
  label,
  plan,
  actual,
  good,
}: {
  label: string;
  plan: string;
  actual: string;
  good?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-muted-foreground">{plan}</span>
        <span className="text-muted-foreground/50">→</span>
        <span className={`font-medium ${good ? "text-positive-soft" : "text-negative-soft"}`}>
          {actual}
        </span>
      </span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`font-money mt-1.5 text-2xl font-semibold ${
          tone === "good"
            ? "text-money-up"
            : tone === "bad"
              ? "text-money-down"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

/**
 * One row: planned semester cost, an inline-editable actual (per-occurrence,
 * like the planned amount), and the resulting variance. Used for both expense
 * items and other-income items.
 */
function ExpenseRow({
  item,
  period,
  income,
}: {
  item: BudgetItemRow;
  period: PeriodRow;
  income?: boolean;
}) {
  const [value, setValue] = useState(
    item.actual_amount != null ? String(item.actual_amount) : ""
  );
  const [isPending, startTransition] = useTransition();

  const n = occurrences(item, period);
  const plannedSemester = item.amount * n;
  const hasActual = value.trim() !== "";
  const actualPer = parseFloat(value);
  const actualSemester =
    hasActual && !isNaN(actualPer) && actualPer >= 0 ? actualPer * n : null;
  const delta =
    actualSemester != null ? actualSemester - plannedSemester : null;

  function save() {
    const normalized = hasActual ? String(actualPer) : "";
    const original = item.actual_amount != null ? String(item.actual_amount) : "";
    if (normalized === original) return;
    const fd = new FormData();
    fd.set("id", String(item.id));
    fd.set("actual", hasActual ? String(actualPer) : "");
    startTransition(() => setActualAmount(fd));
  }

  return (
    <div className="grid grid-cols-[1.6fr_1fr_1fr_6.5rem] items-center gap-3 px-6 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {item.category}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {fmtDate(item.date)}
          {item.frequency === "monthly" && ` · monthly ×${n}`}
          {item.frequency === "yearly" && " · yearly"}
        </p>
      </div>

      <p className="font-money text-right text-sm text-muted-foreground">
        {fmtUSD(plannedSemester)}
      </p>

      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={value}
          placeholder="—"
          disabled={isPending}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="font-money w-full rounded-lg border border-input bg-background py-1.5 pl-6 pr-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40 disabled:opacity-50"
          title={n > 1 ? "Per month — multiplied across the semester" : undefined}
        />
        {n > 1 && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground/70">
            /mo
          </span>
        )}
      </div>

      <VarianceCell delta={delta} goodWhenPositive={income} />
    </div>
  );
}

function VarianceCell({
  delta,
  goodWhenPositive,
}: {
  delta: number | null;
  goodWhenPositive?: boolean;
}) {
  if (delta == null || delta === 0) {
    return <span className="font-money text-right text-sm text-muted-foreground/50">—</span>;
  }
  // For spending, over plan (positive) is bad. For income, over plan is good.
  const positive = delta > 0;
  const isGood = goodWhenPositive ? positive : !positive;
  return (
    <span
      className={`font-money text-right text-sm font-semibold ${
        isGood ? "text-money-up" : "text-money-down"
      }`}
    >
      {positive ? "+" : "−"}
      {fmtUSD(Math.abs(delta))}
    </span>
  );
}

type BillTone = "paid" | "overdue" | "soon" | "neutral";

/** Whole-day difference between a due date and today (both YYYY-MM-DD). */
function daysUntil(dueIso: string, todayIso: string): number {
  const due = Date.parse(dueIso + "T00:00:00");
  const today = Date.parse(todayIso + "T00:00:00");
  if (isNaN(due) || isNaN(today)) return 0;
  return Math.round((due - today) / 86_400_000);
}

/** A bill's status badge — paid, overdue, due-soon, or a future/undated date. */
function billStatus(
  dueIso: string | null,
  paid: boolean,
  todayIso: string
): { label: string; tone: BillTone } {
  if (paid) return { label: "Paid", tone: "paid" };
  if (!dueIso) return { label: "No due date", tone: "neutral" };
  const days = daysUntil(dueIso, todayIso);
  if (days < 0) return { label: `Overdue ${-days}d`, tone: "overdue" };
  if (days === 0) return { label: "Due today", tone: "soon" };
  if (days <= 14) return { label: `Due in ${days}d`, tone: "soon" };
  return { label: `Due ${fmtDate(dueIso)}`, tone: "neutral" };
}

const BILL_BADGE: Record<BillTone, string> = {
  paid: "bg-muted text-muted-foreground",
  overdue: "bg-destructive/10 text-money-down",
  soon: "bg-warning/10 text-warning",
  neutral: "bg-muted text-muted-foreground",
};

/** One bill: a paid checkbox, the obligation + due date, a status badge, amount. */
function BillRow({
  item,
  period,
  todayIso,
}: {
  item: BudgetItemRow;
  period: PeriodRow;
  todayIso: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [actual, setActual] = useState(
    item.actual_amount != null ? String(item.actual_amount) : ""
  );
  const paid = item.paid === 1;
  const n = occurrences(item, period);
  const status = billStatus(item.date, paid, todayIso);
  const hasActual = actual.trim() !== "";
  const actualPer = parseFloat(actual);
  const delta =
    hasActual && !isNaN(actualPer) && actualPer >= 0
      ? (actualPer - item.amount) * n
      : 0;

  function toggle() {
    const fd = new FormData();
    fd.set("id", String(item.id));
    fd.set("paid", paid ? "0" : "1");
    startTransition(() => setBillPaid(fd));
  }
  function saveActual() {
    const normalized = hasActual && !isNaN(actualPer) ? String(actualPer) : "";
    const original = item.actual_amount != null ? String(item.actual_amount) : "";
    if (normalized === original) return;
    const fd = new FormData();
    fd.set("id", String(item.id));
    fd.set("actual", normalized);
    startTransition(() => setActualAmount(fd));
  }

  return (
    <div
      className={`grid grid-cols-[1.5rem_1.7fr_1fr_1fr] items-center gap-3 px-6 py-3 transition-opacity ${
        paid ? "opacity-60" : ""
      }`}
    >
      <input
        type="checkbox"
        checked={paid}
        disabled={isPending}
        onChange={toggle}
        aria-label={`Mark ${item.name} paid`}
        className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={`truncate text-sm font-medium text-foreground ${
              paid ? "line-through decoration-muted-foreground/40" : ""
            }`}
          >
            {item.name}
          </p>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {item.category}
          </span>
        </div>
        {item.date && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Due {fmtDate(item.date)}
            {n > 1 && ` · monthly ×${n}`}
          </p>
        )}
      </div>
      <span
        className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${BILL_BADGE[status.tone]}`}
      >
        {status.label}
      </span>
      <div>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            $
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={actual}
            placeholder={String(item.amount)}
            disabled={isPending}
            onChange={(e) => setActual(e.target.value)}
            onBlur={saveActual}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label={`Actual amount for ${item.name}`}
            title="What it actually billed — leave blank to use the plan"
            className="font-money w-full rounded-lg border border-input bg-background py-1.5 pl-5 pr-2 text-right text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40 disabled:opacity-50"
          />
        </div>
        {delta !== 0 && (
          <p
            className={`mt-0.5 text-right text-[11px] font-medium ${
              delta > 0 ? "text-money-down" : "text-money-up"
            }`}
          >
            {delta > 0 ? "+" : "−"}
            {fmtUSD(Math.abs(delta))} vs plan
          </p>
        )}
      </div>
    </div>
  );
}
