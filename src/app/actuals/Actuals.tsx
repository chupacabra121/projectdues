"use client";

import { useState, useTransition } from "react";
import { setActualAmount } from "@/app/actions/budget";
import { BudgetItemRow, MemberRow, PeriodRow } from "@/lib/db";
import { buildForecast, fmtUSD, fmtDate, occurrences } from "@/lib/forecast";
import { memberDuesAmount } from "@/lib/memberDues";

export default function Actuals({
  period,
  items,
  members,
}: {
  period: PeriodRow;
  items: BudgetItemRow[];
  members: MemberRow[];
}) {
  const expenses = items.filter((i) => i.type !== "other_income");
  const otherIncome = items.filter((i) => i.type === "other_income");

  // Planned vs actual on the spending side, computed on semester totals.
  const recorded = expenses.filter((i) => i.actual_amount != null);
  const actualRecorded = recorded.reduce(
    (s, i) => s + i.actual_amount! * occurrences(i, period),
    0
  );
  const plannedForRecorded = recorded.reduce(
    (s, i) => s + i.amount * occurrences(i, period),
    0
  );
  const spendVariance = actualRecorded - plannedForRecorded;

  // Income side: billed (full roster obligation) vs collected (paid checkboxes).
  const duesOf = (m: MemberRow) =>
    memberDuesAmount(
      m.status,
      m.aid_plan,
      m.aid_amount,
      period.dues_plans,
      period.active_dues,
      period.pledge_dues
    );
  const dueMembers = members.filter(
    (m) => m.status === "active" || m.status === "pledge"
  );
  const activeMembers = members.filter((m) => m.status === "active");
  const pledgeMembers = members.filter((m) => m.status === "pledge");
  const billed = dueMembers.reduce((s, m) => s + duesOf(m), 0);
  const collected = dueMembers
    .filter((m) => m.dues_paid === 1)
    .reduce((s, m) => s + duesOf(m), 0);
  const outstanding = Math.max(0, billed - collected);
  const paidCount = dueMembers.filter((m) => m.dues_paid === 1).length;
  const unpaid = dueMembers
    .filter((m) => m.dues_paid !== 1 && duesOf(m) > 0)
    .map((m) => ({ id: m.id, name: m.name, status: m.status, amount: duesOf(m) }))
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
          label="Spending Recorded"
          value={fmtUSD(actualRecorded)}
          sub={
            recorded.length === 0
              ? `0 of ${expenses.length} items recorded`
              : `${recorded.length} of ${expenses.length} items · ${spendVariance >= 0 ? "+" : "−"}${fmtUSD(Math.abs(spendVariance))} vs plan`
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

      {/* Expenses — planned vs actual */}
      <section className="mb-6 overflow-hidden rounded-[1.5rem] border border-border bg-card">
        <div className="border-b border-border/60 px-6 pb-4 pt-6">
          <h2 className="font-semibold text-foreground">Expenses — planned vs actual</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Record what each obligation and event really cost. Penny rolls the
            variance into your forecast and dashboard.
          </p>
        </div>

        <div className="hidden grid-cols-[1.6fr_1fr_1fr_6.5rem] gap-3 px-6 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Item</span>
          <span className="text-right">Planned</span>
          <span>Actual</span>
          <span className="text-right">Variance</span>
        </div>

        {expenses.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground/70">
            No obligations or events yet — add them on the Budget tab first.
          </p>
        ) : (
          <div className="divide-y divide-border/40">
            {expenses.map((item) => (
              <ExpenseRow key={item.id} item={item} period={period} />
            ))}
          </div>
        )}
      </section>

      {/* Dues — billed vs collected (from the per-member paid checkboxes) */}
      <section className="mb-6 overflow-hidden rounded-[1.5rem] border border-border bg-card">
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
            sub={`${activeMembers.length} actives + ${pledgeMembers.length} pledges`}
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
                    <span className="ml-2 text-xs text-muted-foreground">
                      {m.status === "pledge" ? "pledge" : "active"}
                    </span>
                  </span>
                  <span className="font-medium text-destructive">{fmtUSD(m.amount)}</span>
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
        <section className="overflow-hidden rounded-[1.5rem] border border-border bg-card">
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
        className={`mt-1 text-xl font-semibold ${
          tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : "text-foreground"
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
        <span className={`font-medium ${good ? "text-primary" : "text-destructive"}`}>
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
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-semibold ${
          tone === "good"
            ? "text-primary"
            : tone === "bad"
              ? "text-destructive"
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

      <p className="text-right text-sm text-muted-foreground">
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
          className="w-full rounded-lg border border-input bg-background py-1.5 pl-6 pr-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40 disabled:opacity-50"
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
    return <span className="text-right text-sm text-muted-foreground/50">—</span>;
  }
  // For spending, over plan (positive) is bad. For income, over plan is good.
  const positive = delta > 0;
  const isGood = goodWhenPositive ? positive : !positive;
  return (
    <span
      className={`text-right text-sm font-semibold ${
        isGood ? "text-primary" : "text-destructive"
      }`}
    >
      {positive ? "+" : "−"}
      {fmtUSD(Math.abs(delta))}
    </span>
  );
}
