/**
 * Pure forecasting logic. No database access — callers pass plain inputs so
 * the same math runs on the server (dashboard) and in the browser (onboarding
 * preview, what-if controls).
 */

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
}

export interface ForecastItem {
  id?: number;
  type: "fixed_expense" | "planned_event";
  name: string;
  amount: number;
  date: string | null;
  frequency: "one_time" | "monthly" | "yearly";
  category: string;
}

export interface ScenarioForecast {
  label: "Conservative" | "Expected" | "Optimistic";
  pledgeCount: number;
  projectedRevenue: number;
  remainingBalance: number;
}

export interface Forecast {
  projectedRevenue: number;
  outstandingDues: number;
  fixedObligations: number;
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
    (s.active_members * s.active_dues + pledgeCount * s.pledge_dues) *
    s.collection_rate
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
  return item.amount * occurrences(item, s);
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
  items: ForecastItem[]
): Forecast {
  const projectedRevenue = revenueFor(s, s.pledges_expected);
  const fixedObligations = totalFor(items, "fixed_expense", s);
  const plannedEvents = totalFor(items, "planned_event", s);
  const totalCommitted = fixedObligations + plannedEvents;
  const remainingBalance =
    s.starting_balance + projectedRevenue - totalCommitted;

  const scenarios: ScenarioForecast[] = (
    [
      ["Conservative", s.pledges_conservative],
      ["Expected", s.pledges_expected],
      ["Optimistic", s.pledges_optimistic],
    ] as const
  ).map(([label, pledgeCount]) => {
    const rev = revenueFor(s, pledgeCount);
    return {
      label,
      pledgeCount,
      projectedRevenue: rev,
      remainingBalance: s.starting_balance + rev - totalCommitted,
    };
  });

  return {
    projectedRevenue,
    outstandingDues: Math.max(0, projectedRevenue - s.dues_collected),
    fixedObligations,
    plannedEvents,
    remainingBalance,
    totalCommitted,
    scenarios,
    insights: buildInsights(s, items, {
      projectedRevenue,
      fixedObligations,
      plannedEvents,
      remainingBalance,
    }),
  };
}

function buildInsights(
  s: ForecastSettings,
  items: ForecastItem[],
  f: {
    projectedRevenue: number;
    fixedObligations: number;
    plannedEvents: number;
    remainingBalance: number;
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
    revenueFor(s, s.pledges_conservative) -
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
