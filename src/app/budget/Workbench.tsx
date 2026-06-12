"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { updateBudgetSettings } from "@/app/actions/setup";
import { BudgetItemRow, SettingsRow } from "@/lib/db";
import {
  buildForecast,
  ForecastSettings,
  fmtUSD,
  revenueFor,
} from "@/lib/forecast";
import { AddItemForm, ItemRow } from "./ItemForms";
import { inputCls } from "@/components/AuthShell";

interface MoneyInState {
  activeMembers: string;
  activeDues: string;
  pledgeDues: string;
  collectionRate: string;
  conservative: string;
  expected: string;
  optimistic: string;
  startingBalance: string;
  duesCollected: string;
  reserveTarget: string;
  semesterStart: string;
  semesterEnd: string;
}

const num = (s: string) => {
  const n = parseFloat(s);
  return isNaN(n) || n < 0 ? 0 : n;
};
const int = (s: string) => Math.round(num(s));

export default function Workbench({
  settings,
  items,
}: {
  settings: SettingsRow;
  items: BudgetItemRow[];
}) {
  const [s, setS] = useState<MoneyInState>({
    activeMembers: String(settings.active_members),
    activeDues: String(settings.active_dues),
    pledgeDues: String(settings.pledge_dues),
    collectionRate: String(Math.round(settings.collection_rate * 100)),
    conservative: String(settings.pledges_conservative),
    expected: String(settings.pledges_expected),
    optimistic: String(settings.pledges_optimistic),
    startingBalance: String(settings.starting_balance),
    duesCollected: String(settings.dues_collected),
    reserveTarget: String(settings.reserve_target),
    semesterStart: settings.semester_start,
    semesterEnd: settings.semester_end,
  });
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [, startTransition] = useTransition();
  const firstRender = useRef(true);

  const live: ForecastSettings = useMemo(
    () => ({
      active_members: int(s.activeMembers),
      current_pledges: settings.current_pledges,
      pledges_conservative: int(s.conservative),
      pledges_expected: int(s.expected),
      pledges_optimistic: int(s.optimistic),
      active_dues: num(s.activeDues),
      pledge_dues: num(s.pledgeDues),
      collection_rate: Math.min(100, num(s.collectionRate)) / 100,
      starting_balance: num(s.startingBalance),
      dues_collected: num(s.duesCollected),
      reserve_target: num(s.reserveTarget),
      semester_start: s.semesterStart,
      semester_end: s.semesterEnd,
    }),
    [s, settings.current_pledges]
  );

  const forecast = useMemo(() => buildForecast(live, items), [live, items]);

  // Debounced auto-save of the Money In panel.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("dirty");
    const t = setTimeout(() => {
      setSaveState("saving");
      startTransition(async () => {
        await updateBudgetSettings({
          activeMembers: live.active_members,
          activeDues: live.active_dues,
          pledgeDues: live.pledge_dues,
          collectionRate: live.collection_rate * 100,
          pledgesConservative: live.pledges_conservative,
          pledgesExpected: live.pledges_expected,
          pledgesOptimistic: live.pledges_optimistic,
          startingBalance: live.starting_balance,
          duesCollected: live.dues_collected,
          reserveTarget: live.reserve_target,
          semesterStart: live.semester_start,
          semesterEnd: live.semester_end,
        });
        setSaveState("saved");
      });
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  const set = (key: keyof MoneyInState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setS((prev) => ({ ...prev, [key]: e.target.value }));

  const obligations = items.filter((i) => i.type === "fixed_expense");
  const events = items.filter((i) => i.type === "planned_event");
  const income = items.filter((i) => i.type === "other_income");

  const activesSubtotal = live.active_members * live.active_dues;
  const pledgesSubtotal = live.pledges_expected * live.pledge_dues;
  const haircut = (activesSubtotal + pledgesSubtotal) * (1 - live.collection_rate);

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Changes save automatically and update the forecast as you type.
        </p>
        <SaveIndicator state={saveState} />
      </div>

      {/* Summary strip */}
      <section className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Total Income" value={fmtUSD(forecast.totalIncome)}
          sub={forecast.otherIncome > 0 ? `incl. ${fmtUSD(forecast.otherIncome)} other income` : "dues, expected pledge class"} />
        <SummaryCard label="Fixed Obligations" value={fmtUSD(forecast.fixedObligations)}
          sub={`${obligations.length} item${obligations.length === 1 ? "" : "s"}`} />
        <SummaryCard label="Planned Events" value={fmtUSD(forecast.plannedEvents)}
          sub={`${events.length} item${events.length === 1 ? "" : "s"}`} />
        <SummaryCard label="Projected Remaining" value={fmtUSD(forecast.remainingBalance)}
          sub={forecast.remainingBalance >= 0 ? "surplus" : "deficit"}
          tone={forecast.remainingBalance >= 0 ? "good" : "bad"} />
      </section>

      {/* Scenario chips */}
      <div className="mb-8 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">End balance by pledge class:</span>
        {forecast.scenarios.map((sc) => (
          <span
            key={sc.label}
            className={`rounded-full px-3 py-1 font-medium ${
              sc.remainingBalance >= 0
                ? "bg-primary/10 text-accent-foreground"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {sc.label} ({sc.pledgeCount}): {fmtUSD(sc.remainingBalance)}
          </span>
        ))}
      </div>

      {/* Money In */}
      <section id="money-in" className="mb-6 rounded-[1.5rem] border border-border bg-card p-6">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="font-semibold text-foreground">Money In</h2>
          <span className="text-lg font-semibold text-primary">
            {fmtUSD(forecast.totalIncome)}
          </span>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Membership, dues, and any other income for the semester
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Active Members" value={s.activeMembers} onChange={set("activeMembers")} />
          <Field label="Active Dues" value={s.activeDues} onChange={set("activeDues")} prefix="$" />
          <Field label="Pledge Dues" value={s.pledgeDues} onChange={set("pledgeDues")} prefix="$" />
          <Field label="Collection Rate" value={s.collectionRate} onChange={set("collectionRate")} suffix="%" max={100} />
        </div>

        <p className="mb-3 mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          New Pledge Class — three scenarios
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Conservative" value={s.conservative} onChange={set("conservative")}
            hint={`→ ${fmtUSD(revenueFor(live, int(s.conservative)))} revenue`} />
          <Field label="Expected" value={s.expected} onChange={set("expected")}
            hint={`→ ${fmtUSD(revenueFor(live, int(s.expected)))} revenue`} highlight />
          <Field label="Optimistic" value={s.optimistic} onChange={set("optimistic")}
            hint={`→ ${fmtUSD(revenueFor(live, int(s.optimistic)))} revenue`} />
        </div>

        <p className="mb-3 mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Balances & targets
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Starting Balance" value={s.startingBalance} onChange={set("startingBalance")} prefix="$" />
          <Field label="Dues Collected So Far" value={s.duesCollected} onChange={set("duesCollected")} prefix="$" />
          <Field label="Reserve Target" value={s.reserveTarget} onChange={set("reserveTarget")} prefix="$" />
          <Field label="Semester Start" value={s.semesterStart} onChange={set("semesterStart")} type="date" />
          <Field label="Semester End" value={s.semesterEnd} onChange={set("semesterEnd")} type="date" />
        </div>

        {/* Dues math, spelled out */}
        <div className="mt-6 rounded-2xl bg-muted/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
          {int(s.activeMembers)} actives × {fmtUSD(live.active_dues)} ={" "}
          <span className="font-medium text-foreground">{fmtUSD(activesSubtotal)}</span>
          {" + "}
          {int(s.expected)} pledges × {fmtUSD(live.pledge_dues)} ={" "}
          <span className="font-medium text-foreground">{fmtUSD(pledgesSubtotal)}</span>
          {" − "}
          <span className="text-destructive">{fmtUSD(haircut)}</span> uncollected (
          {Math.round((1 - live.collection_rate) * 100)}%)
          {forecast.otherIncome > 0 && (
            <>
              {" + "}
              <span className="font-medium text-primary">{fmtUSD(forecast.otherIncome)}</span>{" "}
              other income
            </>
          )}
          {" = "}
          <span className="font-semibold text-foreground">{fmtUSD(forecast.totalIncome)}</span>
        </div>

        <div className="mt-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Other Income — fundraisers, donations, allocations
          </p>
          <div className="mb-3 space-y-2">
            {income.map((item) => (
              <ItemRow key={item.id} item={item} settings={live} />
            ))}
          </div>
          <AddItemForm type="other_income" />
        </div>
      </section>

      {/* Money Out */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ItemColumn
          title="Fixed Obligations"
          subtitle="Things we must pay"
          total={forecast.fixedObligations}
          items={obligations}
          settings={live}
          type="fixed_expense"
          accent="text-amber-600"
        />
        <ItemColumn
          title="Planned Events"
          subtitle="Things we want to do"
          total={forecast.plannedEvents}
          items={events}
          settings={live}
          type="planned_event"
          accent="text-foreground"
        />
      </div>
    </>
  );
}

function SaveIndicator({ state }: { state: "idle" | "dirty" | "saving" | "saved" }) {
  if (state === "idle") return null;
  const text =
    state === "saved" ? "✓ Saved" : state === "saving" ? "Saving…" : "Unsaved changes";
  return (
    <span
      className={`whitespace-nowrap text-sm ${state === "saved" ? "text-primary" : "text-muted-foreground"}`}
    >
      {text}
    </span>
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
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
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

function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  highlight,
  type = "number",
  max,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  highlight?: boolean;
  type?: string;
  max?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground/80">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <input
          type={type}
          min={0}
          max={max}
          value={value}
          onChange={onChange}
          className={`${inputCls} ${prefix ? "pl-7" : ""} ${suffix ? "pr-8" : ""} ${
            highlight ? "border-primary/50 ring-1 ring-primary/20" : ""
          }`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ItemColumn({
  title,
  subtitle,
  total,
  items,
  settings,
  type,
  accent,
}: {
  title: string;
  subtitle: string;
  total: number;
  items: BudgetItemRow[];
  settings: ForecastSettings;
  type: "fixed_expense" | "planned_event";
  accent: string;
}) {
  return (
    <section className="rounded-[1.5rem] border border-border bg-card p-6">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-semibold text-foreground">{title}</h2>
        <span className={`text-lg font-semibold ${accent}`}>{fmtUSD(total)}</span>
      </div>
      <p className="mb-5 text-sm text-muted-foreground">{subtitle}</p>
      <div className="mb-4 space-y-2">
        {items.length === 0 && (
          <p className="py-3 text-center text-sm text-muted-foreground/70">Nothing here yet.</p>
        )}
        {items.map((item) => (
          <ItemRow key={item.id} item={item} settings={settings} />
        ))}
      </div>
      <AddItemForm type={type} />
    </section>
  );
}
