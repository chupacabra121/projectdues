/**
 * Pure forecasting logic. No database access — callers pass plain inputs so
 * the same math runs on the server (dashboard) and in the browser (onboarding
 * preview, what-if controls).
 */

/** An active member on financial aid who pays a custom, reduced dues amount. */
export interface AidMember {
  name: string;
  amount: number;
}

/**
 * How active dues break down: a majority paying the full rate, plus any
 * financial-aid members who each pay an individual amount. When present this
 * supersedes the flat active_members × active_dues calculation.
 */
export interface ActiveDuesBreakdown {
  fullCount: number;
  fullRate: number;
  aid: AidMember[];
}

export interface ForecastSettings {
  active_members: number;
  current_pledges: number;
  pledges_conservative: number;
  pledges_expected: number;
  pledges_optimistic: number;
  active_dues: number;
  pledge_dues: number;
  collection_rate: number; // 0..1
  starting_balance: number;
  dues_collected: number;
  reserve_target: number;
  semester_start: string; // YYYY-MM-DD
  semester_end: string;
  /** When dues arrive: sixweek | upfront | monthly | thirds. */
  dues_schedule?: string;
  /** Full-dues + financial-aid split; falls back to the flat fields if null. */
  active_dues_breakdown?: ActiveDuesBreakdown | null;
}

/** Total active dues billed before collection rate (full tier + aid members). */
export function activeDuesGross(s: ForecastSettings): number {
  const b = s.active_dues_breakdown;
  if (b) {
    return b.fullCount * b.fullRate + b.aid.reduce((sum, a) => sum + a.amount, 0);
  }
  return s.active_members * s.active_dues;
}

/** Total active headcount, full-dues plus aid members. */
export function activeMemberCount(s: ForecastSettings): number {
  const b = s.active_dues_breakdown;
  if (b) return b.fullCount + b.aid.length;
  return s.active_members;
}

export interface ForecastItem {
  id?: number;
  type: "fixed_expense" | "planned_event" | "other_income" | "variable_expense";
  name: string;
  amount: number;
  /** Real cost once known — replaces the planned amount in every total. */
  actual_amount?: number | null;
  date: string | null;
  frequency: "one_time" | "monthly" | "yearly";
  category: string;
  /** variable_expense only: 'brother' | 'pledge' | 'member' — what `amount` is per. */
  cost_basis?: string | null;
}

/** Per-person bases a variable cost can scale on. */
export type CostBasis = "brother" | "pledge" | "member";

export function costBasisLabel(basis: string | null | undefined): string {
  if (basis === "pledge") return "pledge";
  if (basis === "member") return "person";
  return "brother";
}

/** How many heads a variable cost applies to, for a given pledge-class size. */
export function variableHeadcount(
  basis: string | null | undefined,
  s: ForecastSettings,
  pledgeCount: number
): number {
  const active = activeMemberCount(s);
  if (basis === "pledge") return Math.max(0, pledgeCount);
  if (basis === "member") return active + Math.max(0, pledgeCount);
  return active; // 'brother' (default) — the full-member tier
}

/** A single variable-expense item's total at a given pledge-class size. */
export function variableItemCost(
  item: ForecastItem,
  s: ForecastSettings,
  pledgeCount: number
): number {
  return (
    Math.max(0, effectiveAmount(item)) *
    variableHeadcount(item.cost_basis, s, pledgeCount)
  );
}

/** Total of all variable obligations at a given pledge-class size. */
export function variableObligationsFor(
  items: ForecastItem[],
  s: ForecastSettings,
  pledgeCount: number
): number {
  return items
    .filter((i) => i.type === "variable_expense")
    .reduce((sum, i) => sum + variableItemCost(i, s, pledgeCount), 0);
}

/** The number the math should use: actual cost once known, plan until then. */
export function effectiveAmount(item: ForecastItem): number {
  return item.actual_amount ?? item.amount;
}

export interface ScenarioForecast {
  label: "Conservative" | "Expected" | "Optimistic";
  pledgeCount: number;
  projectedRevenue: number;
  remainingBalance: number;
}

export interface Forecast {
  projectedRevenue: number;
  otherIncome: number;
  totalIncome: number;
  /** Σ(actual − planned) across items with a known actual. >0 = over plan. */
  variance: number;
  outstandingDues: number;
  fixedObligations: number;
  variableObligations: number;
  plannedEvents: number;
  remainingBalance: number;
  totalCommitted: number;
  scenarios: ScenarioForecast[];
  insights: Insight[];
}

export interface Insight {
  tone: "good" | "warn" | "bad" | "info";
  text: string;
}

export function revenueFor(s: ForecastSettings, pledgeCount: number): number {
  return (
    (activeDuesGross(s) + pledgeCount * s.pledge_dues) * s.collection_rate
  );
}

/**
 * How many times an item hits the budget within the semester window.
 * Monthly items recur once per calendar month of the semester; one-time and
 * yearly items count once.
 */
export function occurrences(item: ForecastItem, s: ForecastSettings): number {
  if (item.frequency !== "monthly") return 1;
  const start = new Date(s.semester_start + "T00:00:00");
  const end = new Date(s.semester_end + "T00:00:00");
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 1;
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1
  );
}

export function itemSemesterCost(item: ForecastItem, s: ForecastSettings): number {
  if (item.type === "variable_expense") {
    return variableItemCost(item, s, s.pledges_expected);
  }
  return effectiveAmount(item) * occurrences(item, s);
}

export function totalFor(
  items: ForecastItem[],
  type: ForecastItem["type"],
  s: ForecastSettings
): number {
  return items
    .filter((i) => i.type === type)
    .reduce((sum, i) => sum + itemSemesterCost(i, s), 0);
}

export function buildForecast(
  s: ForecastSettings,
  items: ForecastItem[],
  caps: Record<string, number> = {}
): Forecast {
  const projectedRevenue = revenueFor(s, s.pledges_expected);
  const otherIncome = totalFor(items, "other_income", s);
  const fixedObligations = totalFor(items, "fixed_expense", s);
  // Per-head costs at the expected pledge class; scenarios re-scale below.
  const variableObligations = variableObligationsFor(items, s, s.pledges_expected);
  const plannedEvents = totalFor(items, "planned_event", s);
  const flatCommitted = fixedObligations + plannedEvents;
  const totalCommitted = flatCommitted + variableObligations;
  const totalIncome = projectedRevenue + otherIncome;
  const remainingBalance = s.starting_balance + totalIncome - totalCommitted;
  const variance = items
    .filter(
      (i) =>
        (i.type === "fixed_expense" || i.type === "planned_event") &&
        i.actual_amount != null
    )
    .reduce(
      (sum, i) => sum + (i.actual_amount! - i.amount) * occurrences(i, s),
      0
    );

  const scenarios: ScenarioForecast[] = (
    [
      ["Conservative", s.pledges_conservative],
      ["Expected", s.pledges_expected],
      ["Optimistic", s.pledges_optimistic],
    ] as const
  ).map(([label, pledgeCount]) => {
    const rev = revenueFor(s, pledgeCount);
    // More pledges cost more (per-pledge / per-person variable obligations).
    const committed = flatCommitted + variableObligationsFor(items, s, pledgeCount);
    return {
      label,
      pledgeCount,
      projectedRevenue: rev,
      remainingBalance: s.starting_balance + rev + otherIncome - committed,
    };
  });

  return {
    projectedRevenue,
    otherIncome,
    totalIncome,
    variance,
    outstandingDues: Math.max(0, projectedRevenue - s.dues_collected),
    fixedObligations,
    variableObligations,
    plannedEvents,
    remainingBalance,
    totalCommitted,
    scenarios,
    insights: buildInsights(s, items, caps, {
      projectedRevenue,
      otherIncome,
      fixedObligations,
      plannedEvents,
      remainingBalance,
      variance,
    }),
  };
}

function buildInsights(
  s: ForecastSettings,
  items: ForecastItem[],
  caps: Record<string, number>,
  f: {
    projectedRevenue: number;
    otherIncome: number;
    fixedObligations: number;
    plannedEvents: number;
    remainingBalance: number;
    variance: number;
  }
): Insight[] {
  const insights: Insight[] = [];
  const deficit = -f.remainingBalance;

  if (deficit > 0) {
    insights.push({
      tone: "bad",
      text: `Current plans exceed projected funds by ${fmtUSD(deficit)}.`,
    });
    const perPledge = s.pledge_dues * s.collection_rate;
    if (perPledge > 0) {
      const needed = Math.ceil(deficit / perPledge);
      insights.push({
        tone: "info",
        text: `Recruiting ${needed} additional pledge${needed === 1 ? "" : "s"} would eliminate the projected deficit.`,
      });
    }
  } else {
    insights.push({
      tone: "good",
      text: "You can afford all planned events and obligations.",
    });
  }

  // Reserve target check
  if (s.reserve_target > 0) {
    if (f.remainingBalance >= s.reserve_target) {
      insights.push({
        tone: "good",
        text: `Projected end-of-semester balance meets your ${fmtUSD(s.reserve_target)} reserve target with ${fmtUSD(f.remainingBalance - s.reserve_target)} to spare.`,
      });
    } else {
      insights.push({
        tone: "warn",
        text: `Projected balance falls ${fmtUSD(s.reserve_target - f.remainingBalance)} short of your ${fmtUSD(s.reserve_target)} reserve target.`,
      });
    }
  }

  // Plan vs reality
  if (f.variance !== 0) {
    const tracked = items.filter(
      (i) => i.type !== "other_income" && i.actual_amount != null
    );
    const biggestMiss = tracked.reduce((a, b) =>
      Math.abs((b.actual_amount! - b.amount)) > Math.abs((a.actual_amount! - a.amount)) ? b : a
    );
    const missDelta = biggestMiss.actual_amount! - biggestMiss.amount;
    insights.push({
      tone: f.variance > 0 ? "warn" : "good",
      text:
        f.variance > 0
          ? `Actual costs are running ${fmtUSD(f.variance)} over plan${missDelta > 0 ? ` — ${biggestMiss.name} alone came in ${fmtUSD(missDelta)} high` : ""}.`
          : `Actual costs are running ${fmtUSD(-f.variance)} under plan — that's extra cushion.`,
    });
  }

  // Allocation caps ("no committee spends past its budget")
  const spendByCategory = new Map<string, number>();
  for (const i of items) {
    if (i.type === "other_income") continue;
    spendByCategory.set(
      i.category,
      (spendByCategory.get(i.category) ?? 0) + itemSemesterCost(i, s)
    );
  }
  for (const [category, cap] of Object.entries(caps)) {
    const spend = spendByCategory.get(category) ?? 0;
    if (cap > 0 && spend > cap) {
      insights.push({
        tone: "bad",
        text: `${category} is ${fmtUSD(spend - cap)} over its ${fmtUSD(cap)} allocation — trim it or move budget from another category.`,
      });
    }
  }

  // Rainy-day fund guidance (~5% of dues revenue is the common rule)
  if (s.reserve_target <= 0 && f.projectedRevenue > 0) {
    insights.push({
      tone: "info",
      text: `No reserve target set. A common rule is to set aside ~5% of dues revenue (${fmtUSD(f.projectedRevenue * 0.05)}) as a rainy-day fund.`,
    });
  }

  // Biggest event trim suggestion
  const events = items.filter((i) => i.type === "planned_event");
  if (events.length > 0) {
    const biggest = events.reduce((a, b) => (b.amount > a.amount ? b : a));
    const tenPct = biggest.amount * 0.1;
    if (tenPct >= 100) {
      insights.push({
        tone: "info",
        text: `Reducing ${biggest.name} by 10% would increase reserves by ${fmtUSD(tenPct)}.`,
      });
    }
  }

  // Recruitment downside risk
  const conservativeRemaining =
    s.starting_balance +
    revenueFor(s, s.pledges_conservative) +
    f.otherIncome -
    f.fixedObligations -
    f.plannedEvents;
  if (f.remainingBalance >= 0 && conservativeRemaining < 0) {
    insights.push({
      tone: "warn",
      text: `If recruitment comes in at the conservative estimate (${s.pledges_conservative} pledges), you would run a ${fmtUSD(-conservativeRemaining)} deficit.`,
    });
  }

  // Obligations vs revenue sanity check
  if (f.projectedRevenue > 0 && f.fixedObligations > f.projectedRevenue * 0.6) {
    insights.push({
      tone: "warn",
      text: `Fixed obligations consume ${Math.round((f.fixedObligations / f.projectedRevenue) * 100)}% of projected revenue, leaving little flexibility.`,
    });
  }

  return insights;
}

export function fmtUSD(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
