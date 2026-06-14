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
} from "@/lib/forecast";
import { AddItemForm, ItemRow } from "./ItemForms";
import { inputCls } from "@/components/AuthShell";

interface MoneyInState {
  fullRate: string;
  pledgeDues: string;
  nonPayers: string;
  conservative: string;
  expected: string;
  optimistic: string;
  startingBalance: string;
  reserveTarget: string;
  semesterStart: string;
  semesterEnd: string;
}

const num = (s: string) => {
  const n = parseFloat(s);
  return isNaN(n) || n < 0 ? 0 : n;
};
const int = (s: string) => Math.round(num(s));

/** Green = money you actually have to spend (positive); red = a hole. */
type Tone = "good" | "bad" | "neutral";
const toneText = (t: Tone) =>
  t === "good" ? "text-money-up" : t === "bad" ? "text-money-down" : "text-foreground";
const signTone = (n: number): Tone => (n >= 0 ? "good" : "bad");

export default function Workbench({
  settings,
  items,
  caps,
}: {
  settings: PeriodRow;
  items: BudgetItemRow[];
  caps: Record<string, number>;
}) {
  const bd = settings.active_dues_breakdown;
  const [s, setS] = useState<MoneyInState>({
    fullRate: String(bd ? bd.fullRate : settings.active_dues),
    pledgeDues: String(settings.pledge_dues),
    nonPayers: String(
      Math.max(
        0,
        Math.round(
          (1 - settings.collection_rate) *
            (settings.active_members + settings.pledges_expected)
        )
      )
    ),
    conservative: String(settings.pledges_conservative),
    expected: String(settings.pledges_expected),
    optimistic: String(settings.pledges_optimistic),
    startingBalance: String(settings.starting_balance),
    reserveTarget: String(settings.reserve_target),
    semesterStart: settings.semester_start,
    semesterEnd: settings.semester_end,
  });
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [, startTransition] = useTransition();
  const firstRender = useRef(true);

  const live: ForecastSettings = useMemo(() => {
    // Member count + financial aid come from the roster (materialized onto the
    // period); the Budget tab only edits the set rate, for instant preview.
    const aid = bd?.aid ?? [];
    const breakdown = {
      fullCount: bd?.fullCount ?? 0,
      fullRate: num(s.fullRate),
      aid,
    };
    const activeCount = breakdown.fullCount + aid.length;
    // Collection rate is driven by an estimated non-payer count: each expected
    // non-payer is valued at the average dues, i.e. rate = 1 − N / billed.
    const billed = activeCount + int(s.expected);
    const nonPayers = Math.max(0, Math.min(billed, int(s.nonPayers)));
    return {
      active_members: activeCount,
      current_pledges: settings.current_pledges,
      pledges_conservative: int(s.conservative),
      pledges_expected: int(s.expected),
      pledges_optimistic: int(s.optimistic),
      active_dues: breakdown.fullRate,
      active_dues_breakdown: breakdown,
      pledge_dues: num(s.pledgeDues),
      collection_rate: billed > 0 ? Math.max(0, 1 - nonPayers / billed) : 1,
      starting_balance: num(s.startingBalance),
      dues_collected: settings.dues_collected,
      reserve_target: num(s.reserveTarget),
      semester_start: s.semesterStart,
      semester_end: s.semesterEnd,
      dues_schedule: settings.dues_schedule,
    };
  }, [s, settings.current_pledges, settings.dues_collected, settings.dues_schedule, bd]);

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
          activeDues: live.active_dues_breakdown!.fullRate,
          pledgeDues: live.pledge_dues,
          collectionRate: live.collection_rate * 100,
          pledgesConservative: live.pledges_conservative,
          pledgesExpected: live.pledges_expected,
          pledgesOptimistic: live.pledges_optimistic,
          startingBalance: live.starting_balance,
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
  const variables = items.filter((i) => i.type === "variable_expense");
  const events = items.filter((i) => i.type === "planned_event");
  const income = items.filter((i) => i.type === "other_income");

  const aidSubtotal = live.active_dues_breakdown!.aid.reduce((sum, a) => sum + a.amount, 0);
  const fullSubtotal = live.active_dues_breakdown!.fullCount * live.active_dues_breakdown!.fullRate;
  const pledgesSubtotal = live.pledges_expected * live.pledge_dues;
  const haircut = (fullSubtotal + aidSubtotal + pledgesSubtotal) * (1 - live.collection_rate);
  const billedMembers = live.active_members + live.pledges_expected;
  const collectedPct = Math.round(live.collection_rate * 100);

  // ── The waterfall: money in − obligations = to work with − events = left ──
  const moneyIn = forecast.totalIncome;
  const inBank = live.starting_balance;
  const obligationsTotal = forecast.fixedObligations + forecast.variableObligations;
  const toWorkWith = inBank + moneyIn - obligationsTotal;
  const eventsTotal = forecast.plannedEvents;
  const left = forecast.remainingBalance; // toWorkWith − events
  const reserve = live.reserve_target;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Each step flows into the next — saves as you type.
        </p>
        <SaveIndicator state={saveState} />
      </div>

      {/* Waterfall ribbon — the whole plan on one line */}
      <Ribbon
        inBank={inBank}
        moneyIn={moneyIn}
        obligations={obligationsTotal}
        toWorkWith={toWorkWith}
        events={eventsTotal}
        left={left}
      />

      {/* Starting point — set-once context that seeds the waterfall */}
      <section className="glass glass-lift mb-5 rounded-2xl p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="In the bank now" value={s.startingBalance}
            onChange={set("startingBalance")} prefix="$" />
          <Field label="Reserve to keep" value={s.reserveTarget}
            onChange={set("reserveTarget")} prefix="$" />
          <Field label="Semester start" value={s.semesterStart}
            onChange={set("semesterStart")} type="date" />
          <Field label="Semester end" value={s.semesterEnd}
            onChange={set("semesterEnd")} type="date" />
        </div>
      </section>

      {/* ── STEP 1 · MONEY IN ─────────────────────────────────────────── */}
      <Step n={1} title="Money In" subtitle="Dues you expect to collect, plus other income"
        amount={fmtUSD(moneyIn)} tone="neutral">
        <div className="grid gap-4 lg:grid-cols-2">
          <ActiveDuesGroup
            fullCount={live.active_dues_breakdown!.fullCount}
            aidCount={live.active_dues_breakdown!.aid.length}
            fullRate={s.fullRate}
            onFullRate={set("fullRate")}
            fullSubtotal={fullSubtotal}
            aidSubtotal={aidSubtotal}
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
          />
        </div>

        {/* Recruitment range — low/high that power the outlook in step 5 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs">
          <span className="font-medium text-foreground">Recruitment range</span>
          <label className="flex items-center gap-1.5 text-muted-foreground">
            Low
            <input type="number" min={0} value={s.conservative} onChange={set("conservative")}
              aria-label="Conservative pledge count"
              className="w-14 rounded-lg border border-input bg-background px-2 py-1 text-center text-sm font-medium text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40" />
          </label>
          <label className="flex items-center gap-1.5 text-muted-foreground">
            High
            <input type="number" min={0} value={s.optimistic} onChange={set("optimistic")}
              aria-label="Optimistic pledge count"
              className="w-14 rounded-lg border border-input bg-background px-2 py-1 text-center text-sm font-medium text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40" />
          </label>
          <span className="text-muted-foreground">used for the outlook in step 4</span>
        </div>

        {/* How many actually pay */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5">
          <label className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-foreground">Expect won&apos;t pay</span>
            <input
              type="number" min={0} max={billedMembers}
              value={s.nonPayers}
              onChange={set("nonPayers")}
              aria-label="Members expected not to pay"
              className={`${inputCls} w-[4.5rem] text-center font-semibold`}
            />
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              of {billedMembers}
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            ≈ {collectedPct}% collected · most chapters land 90–97%
            {haircut > 0 && (
              <>
                {" · "}
                <span className="font-medium text-destructive">−{fmtUSD(haircut)}</span> uncollected
              </>
            )}
          </p>
        </div>

        {/* Other income */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Other income · fundraisers, donations, allocations
          </p>
          {income.length > 0 && (
            <div className="mb-2 space-y-2">
              {income.map((item) => (
                <ItemRow key={item.id} item={item} settings={live} />
              ))}
            </div>
          )}
          <AddItemForm type="other_income" />
        </div>
      </Step>

      {/* ── STEP 2 · OBLIGATIONS ──────────────────────────────────────── */}
      <Step n={2} title="Obligations" subtitle="The bills you must pay before anything else"
        amount={`−${fmtUSD(obligationsTotal)}`} tone="neutral">
        <div className="grid gap-5 lg:grid-cols-2">
          <ItemList
            label="Fixed · flat bills"
            total={forecast.fixedObligations}
            items={obligations}
            settings={live}
            type="fixed_expense"
          />
          <ItemList
            label="Variable · scale with headcount"
            total={forecast.variableObligations}
            items={variables}
            settings={live}
            type="variable_expense"
          />
        </div>
      </Step>

      {/* ── THE MILESTONE · money to work with ────────────────────────── */}
      <div
        data-deficit={toWorkWith < 0}
        className="glass-hero transition-theme my-6 flex items-center justify-between gap-4 rounded-2xl p-6"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Money to work with
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            What&apos;s left for events after the bank, your income, and the must-pay bills.
          </p>
        </div>
        <p
          className={`font-money-display glow breathe transition-theme shrink-0 text-5xl font-semibold sm:text-6xl ${toneText(
            signTone(toWorkWith)
          )}`}
        >
          {fmtUSD(toWorkWith)}
        </p>
      </div>

      {/* ── STEP 3 · PLAN EVENTS ──────────────────────────────────────── */}
      <Step n={3} title="Plan Events" subtitle="Spend the working budget — stay under your caps"
        amount={`−${fmtUSD(eventsTotal)}`} tone="neutral">
        <EventsMeter planned={eventsTotal} budget={toWorkWith} />
        {events.length > 0 && (
          <div className="mb-3 space-y-2">
            {events.map((item) => (
              <ItemRow key={item.id} item={item} settings={live} />
            ))}
          </div>
        )}
        <AddItemForm type="planned_event" />
        <Allocations items={items} settings={live} caps={caps} />
      </Step>

      {/* ── STEP 4 · MONEY LEFT ───────────────────────────────────────── */}
      <Step
        n={4}
        title="Money Left"
        subtitle={`${fmtUSD(toWorkWith)} to work with − ${fmtUSD(eventsTotal)} events`}
        amount={fmtUSD(left)}
        tone={signTone(left)}
        action={
          <Link href="/scenarios" className="shrink-0 text-sm font-medium text-accent-foreground hover:underline">
            Full breakdown →
          </Link>
        }
      >
        {reserve > 0 && (
          <p className={`text-sm ${left >= reserve ? "text-muted-foreground" : "text-destructive"}`}>
            {left >= reserve
              ? `Keeps your ${fmtUSD(reserve)} reserve with ${fmtUSD(left - reserve)} to spare.`
              : `Falls ${fmtUSD(reserve - left)} short of your ${fmtUSD(reserve)} reserve target.`}
          </p>
        )}
        <div className="mt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            If recruitment lands at…
          </p>
          <div className="grid grid-cols-3 gap-2">
            {forecast.scenarios.map((sc) => (
              <div
                key={sc.label}
                className={`rounded-xl border px-3 py-2.5 text-center ${
                  sc.label === "Expected" ? "border-border bg-muted/40" : "border-border bg-background"
                }`}
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {sc.label}
                </p>
                <p className="text-[11px] text-muted-foreground">{sc.pledgeCount} pledges</p>
                <p className={`font-money mt-0.5 text-sm font-semibold ${toneText(signTone(sc.remainingBalance))}`}>
                  {fmtUSD(sc.remainingBalance)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Step>
    </>
  );
}

/** The whole plan as one ledger line: in + income − bills = budget − events = left. */
function Ribbon({
  inBank,
  moneyIn,
  obligations,
  toWorkWith,
  events,
  left,
}: {
  inBank: number;
  moneyIn: number;
  obligations: number;
  toWorkWith: number;
  events: number;
  left: number;
}) {
  return (
    <div className="mb-5 overflow-x-auto">
      <div className="glass ribbon-underline relative flex min-w-max items-stretch gap-0.5 rounded-2xl px-2 py-2 sm:gap-1 sm:px-3">
        <RibbonStat label="In the bank" value={inBank} />
        <Op>+</Op>
        <RibbonStat label="Money in" value={moneyIn} />
        <Op>−</Op>
        <RibbonStat label="Obligations" value={obligations} />
        <Op>=</Op>
        <RibbonStat label="To work with" value={toWorkWith} tone={signTone(toWorkWith)} strong />
        <Op>−</Op>
        <RibbonStat label="Events" value={events} />
        <Op>=</Op>
        <RibbonStat label="Left" value={left} tone={signTone(left)} strong />
      </div>
    </div>
  );
}

function RibbonStat({
  label,
  value,
  tone = "neutral",
  strong,
}: {
  label: string;
  value: number;
  tone?: Tone;
  strong?: boolean;
}) {
  return (
    <div className={`flex flex-col justify-center rounded-xl px-2.5 py-1 sm:px-3 ${strong ? "bg-muted/60" : ""}`}>
      <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={`font-money text-sm font-semibold ${toneText(tone)} ${
          strong ? "glow sm:text-base" : ""
        }`}
      >
        {fmtUSD(value)}
      </span>
    </div>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center px-0.5 text-base text-muted-foreground/50 sm:px-1">
      {children}
    </span>
  );
}

/** A numbered waterfall step with a right-aligned running total. */
function Step({
  n,
  title,
  subtitle,
  amount,
  tone = "neutral",
  action,
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  amount?: string;
  tone?: Tone;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass glass-lift step-spine relative mb-5 overflow-hidden rounded-2xl p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-accent-foreground ring-1 ring-primary/25">
            {n}
          </span>
          <div>
            <h2 className="font-semibold leading-tight text-foreground">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {amount != null && (
            <span className={`font-money text-lg font-semibold ${toneText(tone)}`}>{amount}</span>
          )}
          {action}
        </div>
      </header>
      {children}
    </section>
  );
}

/** A bare list of budget items with a label + subtotal — no heavy card chrome. */
function ItemList({
  label,
  total,
  items,
  settings,
  type,
}: {
  label: string;
  total: number;
  items: BudgetItemRow[];
  settings: ForecastSettings;
  type: "fixed_expense" | "variable_expense" | "planned_event";
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="font-money text-sm font-semibold text-foreground">{fmtUSD(total)}</span>
      </div>
      <div className="mb-2 space-y-2">
        {items.length === 0 && (
          <p className="py-2 text-center text-sm text-muted-foreground">Nothing here yet.</p>
        )}
        {items.map((item) => (
          <ItemRow key={item.id} item={item} settings={settings} />
        ))}
      </div>
      <AddItemForm type={type} />
    </div>
  );
}

/** Events planned vs the working budget — a meter that turns red when over. */
function EventsMeter({ planned, budget }: { planned: number; budget: number }) {
  const over = budget > 0 ? planned > budget : planned > 0;
  const pct = budget > 0 ? Math.min(100, (planned / budget) * 100) : planned > 0 ? 100 : 0;
  const remaining = budget - planned;
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">
          <span className="font-money">{fmtUSD(planned)}</span> planned
        </span>
        <span className={over ? "font-semibold text-money-down" : "text-muted-foreground"}>
          <span className="font-money">{over ? fmtUSD(-remaining) : fmtUSD(remaining)}</span>{" "}
          {over ? "over budget" : "still free"}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
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
    <div className="mt-5 border-t border-border/60 pt-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Category caps · keep each committee inside its budget
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
    </div>
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
          <span className={`font-money ${over ? "font-semibold text-money-down" : "text-muted-foreground"}`}>
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
              className="w-24 rounded-lg border border-input bg-background py-1 pl-5 pr-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40 disabled:opacity-50"
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
        <p className="mt-1 text-xs font-medium text-money-down">
          <span className="font-money">{fmtUSD(planned - capNum)}</span> over allocation
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
      className={`whitespace-nowrap text-sm ${state === "saved" ? "text-money-up" : "text-muted-foreground"}`}
    >
      {text}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  type = "number",
  max,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
  type?: string;
  max?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
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
          className={`${inputCls} ${prefix ? "pl-7" : ""} ${suffix ? "pr-8" : ""}`}
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
 * subtotal, so "23 members × $650 = $14,950" reads as one thought.
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
}: {
  title: string;
  countValue: string;
  onCount: (e: React.ChangeEvent<HTMLInputElement>) => void;
  countNoun: string;
  duesValue: string;
  onDues: (e: React.ChangeEvent<HTMLInputElement>) => void;
  perNoun: string;
  subtotal: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="font-money text-base font-semibold text-foreground">{fmtUSD(subtotal)}</p>
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
 * Active-dues summary. The member count and financial-aid total are derived
 * from the roster (materialized onto the period); only the set rate is editable
 * here. Per-member dues and aid live on the Dues tab.
 */
function ActiveDuesGroup({
  fullCount,
  aidCount,
  fullRate,
  onFullRate,
  fullSubtotal,
  aidSubtotal,
}: {
  fullCount: number;
  aidCount: number;
  fullRate: string;
  onFullRate: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fullSubtotal: number;
  aidSubtotal: number;
}) {
  const totalMembers = fullCount + aidCount;

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Active members</p>
        <p className="font-money text-base font-semibold text-foreground">
          {fmtUSD(fullSubtotal + aidSubtotal)}
        </p>
      </div>

      {/* Count from the roster × the set rate (editable here and on Dues). */}
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <span className="mb-1 block text-xs text-muted-foreground">
            How many{aidCount > 0 ? " (full dues)" : ""}
          </span>
          <div className={`${inputCls} text-center font-medium`} aria-readonly>
            {fullCount}
          </div>
          <span className="mt-1 block text-center text-xs text-muted-foreground">from roster</span>
        </div>
        <span className="pt-7 text-muted-foreground">×</span>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-muted-foreground">Dues each</span>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              type="number" min={0} step="0.01"
              value={fullRate}
              onChange={onFullRate}
              className={`${inputCls} pl-7 text-center font-medium`}
            />
          </div>
          <span className="mt-1 block text-center text-xs text-muted-foreground">per member</span>
        </label>
      </div>

      {aidCount > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Financial aid · {aidCount}
          </span>
          <span className="font-money text-xs font-semibold text-foreground">{fmtUSD(aidSubtotal)}</span>
        </div>
      )}

      <Link
        href="/dues"
        className="mt-3 flex items-center justify-center gap-1 border-t border-border/60 pt-3 text-xs font-medium text-accent-foreground transition-colors hover:underline"
      >
        {`${totalMembers} active members · manage dues & financial aid →`}
      </Link>
    </div>
  );
}
