"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { updateBudgetSettings } from "@/app/actions/setup";
import { setCategoryCap } from "@/app/actions/budget";
import { BudgetItemRow, PeriodRow } from "@/lib/db";
import {
  buildForecast,
  ForecastSettings,
  fmtUSD,
  itemSemesterCost,
  revenueFor,
} from "@/lib/forecast";
import { AddItemForm, ItemRow } from "./ItemForms";
import { inputCls } from "@/components/AuthShell";

interface MoneyInState {
  duesSchedule: string;
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
  caps,
}: {
  settings: PeriodRow;
  items: BudgetItemRow[];
  caps: Record<string, number>;
}) {
  const [s, setS] = useState<MoneyInState>({
    duesSchedule: settings.dues_schedule || "sixweek",
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
      dues_schedule: s.duesSchedule,
    }),
    [s, settings.current_pledges]
  );

  const forecast = useMemo(
    () => buildForecast(live, items, caps),
    [live, items, caps]
  );

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
          duesSchedule: s.duesSchedule,
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
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
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

      {/* Money In */}
      <section id="money-in" className="mb-6 rounded-[1.5rem] border border-border bg-card p-6 sm:p-7">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-foreground">Money In</h2>
          <span className="text-lg font-semibold text-primary">
            {fmtUSD(forecast.totalIncome)}
          </span>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Who&apos;s paying dues this semester, plus any other income.
        </p>

        {/* Dues — each member group keeps its headcount next to its own dues */}
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Dues
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <RevenueGroup
            title="Active members"
            countValue={s.activeMembers}
            onCount={set("activeMembers")}
            countNoun="members"
            duesValue={s.activeDues}
            onDues={set("activeDues")}
            perNoun="member"
            subtotal={activesSubtotal}
          />
          <RevenueGroup
            title="Expected new pledges"
            countValue={s.expected}
            onCount={set("expected")}
            countNoun="pledges"
            duesValue={s.pledgeDues}
            onDues={set("pledgeDues")}
            perNoun="pledge"
            subtotal={pledgesSubtotal}
            highlight
          />
        </div>

        {/* Collection rate → projected dues */}
        <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-medium text-foreground">Collection rate</span>
              <div className="relative w-[4.5rem]">
                <input
                  type="number" min={0} max={100}
                  value={s.collectionRate}
                  onChange={set("collectionRate")}
                  className={`${inputCls} pr-6 text-center font-semibold`}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
              </div>
            </div>
            <input
              type="range" min={0} max={100}
              value={Math.min(100, int(s.collectionRate))}
              onChange={set("collectionRate")}
              aria-label="Collection rate"
              className="h-2 min-w-[160px] flex-1 cursor-pointer accent-[var(--primary)]"
            />
            <p className="text-xs text-muted-foreground">
              Most chapters collect 90–97%.
              {haircut > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-destructive">−{fmtUSD(haircut)}</span>{" "}
                  uncollected
                </>
              )}
            </p>
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-border/60 pt-3">
            <span className="text-sm font-medium text-foreground">Projected dues revenue</span>
            <span className="text-lg font-semibold text-primary">
              {fmtUSD(forecast.projectedRevenue)}
            </span>
          </div>
        </div>

        {/* Recruitment outlook — the range that powers the scenarios below */}
        <div className="mt-6">
          <p className="mb-1 text-sm font-medium text-foreground">Recruitment outlook</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Your budget assumes {int(s.expected)} new pledge{int(s.expected) === 1 ? "" : "s"}.
            Set a low and high to stress-test the scenarios at the bottom of the page.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <RangeStat label="Conservative" value={s.conservative}
              onChange={set("conservative")} revenue={revenueFor(live, int(s.conservative))} />
            <RangeStat label="Expected" value={s.expected}
              revenue={revenueFor(live, int(s.expected))} budget />
            <RangeStat label="Optimistic" value={s.optimistic}
              onChange={set("optimistic")} revenue={revenueFor(live, int(s.optimistic))} />
          </div>
        </div>

        {/* Other income */}
        <div className="mt-6">
          <p className="mb-1 text-sm font-medium text-foreground">Other income</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Fundraisers, donations, university allocations.
          </p>
          <div className="mb-3 space-y-2">
            {income.map((item) => (
              <ItemRow key={item.id} item={item} settings={live} />
            ))}
          </div>
          <AddItemForm type="other_income" />
        </div>

        {/* Total money in */}
        <div className="mt-6 flex items-baseline justify-between rounded-2xl bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium text-foreground">Total money in</span>
          <span className="text-sm text-muted-foreground">
            {fmtUSD(forecast.projectedRevenue)} dues
            {forecast.otherIncome > 0 && ` + ${fmtUSD(forecast.otherIncome)} other`} ={" "}
            <span className="text-lg font-semibold text-primary">
              {fmtUSD(forecast.totalIncome)}
            </span>
          </span>
        </div>

        {/* Starting position & calendar — set-once context */}
        <div className="mt-6 border-t border-border/60 pt-6">
          <p className="mb-3 text-sm font-medium text-foreground">
            Starting position &amp; calendar
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Money in the bank now" value={s.startingBalance}
              onChange={set("startingBalance")} prefix="$" />
            <Field label="Dues already collected" value={s.duesCollected}
              onChange={set("duesCollected")} prefix="$"
              hint="Updates as you record payments on Members." />
            <Field label="Reserve target" value={s.reserveTarget}
              onChange={set("reserveTarget")} prefix="$"
              hint="Cushion to keep at semester's end." />
            <Field label="Semester start" value={s.semesterStart}
              onChange={set("semesterStart")} type="date" />
            <Field label="Semester end" value={s.semesterEnd}
              onChange={set("semesterEnd")} type="date" />
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                Dues arrive
              </label>
              <select
                value={s.duesSchedule}
                onChange={(e) => setS((prev) => ({ ...prev, duesSchedule: e.target.value }))}
                className={inputCls}
              >
                <option value="sixweek">Evenly over first 6 weeks</option>
                <option value="upfront">All at semester start</option>
                <option value="monthly">Monthly installments</option>
                <option value="thirds">⅓ deposit + 2 installments</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                Drives the cash curve.
              </p>
            </div>
          </div>
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

      <Allocations items={items} settings={live} caps={caps} />

      {/* Recruitment scenarios — the bottom line, once every input above is set */}
      <section className="mt-6 rounded-[1.5rem] border border-border bg-card p-6">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-foreground">Recruitment Scenarios</h2>
          <Link
            href="/scenarios"
            className="text-sm font-medium text-primary hover:underline"
          >
            Full breakdown →
          </Link>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Projected end-of-semester balance by pledge class size — the bottom
          line once everything above is filled in.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {forecast.scenarios.map((sc) => {
            const positive = sc.remainingBalance >= 0;
            const isExpected = sc.label === "Expected";
            return (
              <div
                key={sc.label}
                className={`rounded-2xl border p-4 ${
                  isExpected
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-muted/30"
                }`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {sc.label}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {sc.pledgeCount} pledges
                </p>
                <p
                  className={`mt-2 text-xl font-semibold ${
                    positive ? "text-primary" : "text-destructive"
                  }`}
                >
                  {fmtUSD(sc.remainingBalance)}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

/**
 * Committee-style allocations: cap what each category may spend. The classic
 * treasurer rule — no committee spends past its budget without trading funds.
 */
function Allocations({
  items,
  settings,
  caps,
}: {
  items: BudgetItemRow[];
  settings: ForecastSettings;
  caps: Record<string, number>;
}) {
  const spend = new Map<string, number>();
  for (const i of items) {
    if (i.type === "other_income") continue;
    spend.set(i.category, (spend.get(i.category) ?? 0) + itemSemesterCost(i, settings));
  }
  const categories = Array.from(
    new Set([...spend.keys(), ...Object.keys(caps)])
  ).sort((a, b) => (spend.get(b) ?? 0) - (spend.get(a) ?? 0));

  if (categories.length === 0) return null;

  return (
    <section className="mt-6 rounded-[1.5rem] border border-border bg-card p-6">
      <h2 className="font-semibold text-foreground">Allocations</h2>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">
        Give each category a spending cap — like handing every chair their
        budget. Penny flags any category that plans past its cap.
      </p>
      <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
        {categories.map((cat) => (
          <AllocationRow
            key={cat}
            category={cat}
            planned={spend.get(cat) ?? 0}
            cap={caps[cat] ?? 0}
          />
        ))}
      </div>
    </section>
  );
}

function AllocationRow({
  category,
  planned,
  cap,
}: {
  category: string;
  planned: number;
  cap: number;
}) {
  const [value, setValue] = useState(cap > 0 ? String(cap) : "");
  const [isPending, startTransition] = useTransition();
  const capNum = parseFloat(value) || 0;
  const over = capNum > 0 && planned > capNum;
  const pct = capNum > 0 ? Math.min(100, (planned / capNum) * 100) : 0;

  function save() {
    if (capNum === cap) return;
    const fd = new FormData();
    fd.set("category", category);
    fd.set("cap", String(capNum));
    startTransition(() => setCategoryCap(fd));
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {category}
        </span>
        <span className="flex items-center gap-2 text-sm">
          <span className={over ? "font-semibold text-destructive" : "text-muted-foreground"}>
            {fmtUSD(planned)}
          </span>
          <span className="text-muted-foreground">of</span>
          <span className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            <input
              type="number"
              min={0}
              value={value}
              placeholder="no cap"
              onChange={(e) => setValue(e.target.value)}
              onBlur={save}
              disabled={isPending}
              className="w-24 rounded-lg border border-input bg-background py-1 pl-5 pr-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40 disabled:opacity-50"
            />
          </span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        {capNum > 0 ? (
          <div
            className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
      </div>
      {over && (
        <p className="mt-1 text-xs font-medium text-destructive">
          {fmtUSD(planned - capNum)} over allocation
        </p>
      )}
    </div>
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

/**
 * One revenue line — a headcount paired with its own per-head dues and a live
 * subtotal, so "23 members × $650 = $14,950" reads as one thought instead of
 * scattering the count and the rate across a grid.
 */
function RevenueGroup({
  title,
  countValue,
  onCount,
  countNoun,
  duesValue,
  onDues,
  perNoun,
  subtotal,
  highlight,
}: {
  title: string;
  countValue: string;
  onCount: (e: React.ChangeEvent<HTMLInputElement>) => void;
  countNoun: string;
  duesValue: string;
  onDues: (e: React.ChangeEvent<HTMLInputElement>) => void;
  perNoun: string;
  subtotal: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        highlight ? "border-primary/30 bg-primary/5" : "border-border bg-background"
      }`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-base font-semibold text-primary">{fmtUSD(subtotal)}</p>
      </div>
      <div className="flex items-start gap-2">
        <label className="flex-1">
          <span className="mb-1 block text-xs text-muted-foreground">How many</span>
          <input
            type="number" min={0}
            value={countValue}
            onChange={onCount}
            className={`${inputCls} text-center font-medium`}
          />
          <span className="mt-1 block text-center text-xs text-muted-foreground">
            {countNoun}
          </span>
        </label>
        <span className="pt-7 text-muted-foreground">×</span>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-muted-foreground">Dues each</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              type="number" min={0} step="0.01"
              value={duesValue}
              onChange={onDues}
              className={`${inputCls} pl-7 text-center font-medium`}
            />
          </div>
          <span className="mt-1 block text-center text-xs text-muted-foreground">
            per {perNoun}
          </span>
        </label>
      </div>
    </div>
  );
}

/**
 * A single pledge-class scenario in the recruitment outlook. Conservative and
 * Optimistic are editable; Expected is the budget anchor (set in the dues
 * group above) and shown read-only.
 */
function RangeStat({
  label,
  value,
  onChange,
  revenue,
  budget,
}: {
  label: string;
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  revenue: number;
  budget?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        budget ? "border-primary/40 bg-primary/5" : "border-border bg-background"
      }`}
    >
      <p className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {onChange ? (
        <input
          type="number" min={0}
          value={value}
          onChange={onChange}
          aria-label={`${label} pledge count`}
          className="mt-1.5 w-full rounded-lg border border-input bg-background px-2 py-1.5 text-center text-lg font-semibold text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
        />
      ) : (
        <p className="mt-1.5 py-1.5 text-center text-lg font-semibold text-foreground">
          {value || "0"}
        </p>
      )}
      <p className="mt-1 whitespace-nowrap text-center text-xs text-muted-foreground">
        → {fmtUSD(revenue)}
      </p>
      {budget && (
        <p className="mt-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-primary">
          Your budget
        </p>
      )}
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
