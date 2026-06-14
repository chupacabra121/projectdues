"use client";

import { useState, useTransition } from "react";
import { setActualAmount } from "@/app/actions/budget";
import { BudgetItemRow, PeriodRow } from "@/lib/db";
import {
  buildForecast,
  fmtUSD,
  fmtDate,
  occurrences,
  revenueFor,
} from "@/lib/forecast";

export default function Actuals({
  period,
  items,
}: {
  period: PeriodRow;
  items: BudgetItemRow[];
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

  // Income side: projected dues vs collected.
  const projectedRevenue = revenueFor(period, period.pledges_expected);
  const collectedPct =
    projectedRevenue > 0
      ? Math.round((period.dues_collected / projectedRevenue) * 100)
      : 0;

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
          value={fmtUSD(period.dues_collected)}
          sub={`${collectedPct}% of ${fmtUSD(projectedRevenue)} projected`}
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

      {/* Income — planned vs actual */}
      <section className="overflow-hidden rounded-[1.5rem] border border-border bg-card">
        <div className="border-b border-border/60 px-6 pb-4 pt-6">
          <h2 className="font-semibold text-foreground">Income — planned vs actual</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Projected dues vs what&apos;s actually been collected, plus any other
            income.
          </p>
        </div>

        <div className="divide-y divide-border/40">
          {/* Dues row — collected is updated on Members / Budget */}
          <div className="grid grid-cols-[1.6fr_1fr_1fr_6.5rem] items-center gap-3 px-6 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Member Dues</p>
              <p className="text-xs text-muted-foreground">
                {period.active_members} actives + {period.pledges_expected} expected
                pledges · update on Members
              </p>
            </div>
            <p className="text-right text-sm text-muted-foreground">
              {fmtUSD(projectedRevenue)}
            </p>
            <p className="text-sm font-medium text-foreground">
              {fmtUSD(period.dues_collected)}
            </p>
            <VarianceCell delta={period.dues_collected - projectedRevenue} goodWhenPositive />
          </div>

          {otherIncome.map((item) => (
            <ExpenseRow key={item.id} item={item} period={period} income />
          ))}
        </div>
      </section>
    </>
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
