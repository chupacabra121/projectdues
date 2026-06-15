/**
 * Semester cash-curve math for the dashboard charts. Pure functions over the
 * same inputs as the forecast. Modeling assumptions, kept deliberately simple:
 *  - dues arrive per the chapter's schedule (six-week ramp, upfront,
 *    monthly installments, or thirds); collected money is in the bank day one
 *  - undated items hit on day one (conservative for expenses)
 *  - monthly items recur on their day-of-month across the semester
 */
import {
  ForecastItem,
  ForecastSettings,
  effectiveAmount,
  itemSemesterCost,
  revenueFor,
} from "./forecast";

export interface CashPoint {
  day: number;
  date: string; // YYYY-MM-DD
  balance: number;
}

export interface CashCurve {
  points: CashPoint[]; // weekly samples + endpoints
  min: CashPoint; // daily-resolution low point
  end: CashPoint;
  monthTicks: { day: number; label: string }[];
  totalDays: number;
}

export interface MonthFlow {
  label: string;
  income: number;
  spend: number;
}

const DAY = 86_400_000;
const DUES_RAMP_DAYS = 42;

function parseUTC(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  return isNaN(d.getTime()) ? null : d;
}

function isoAt(start: Date, day: number): string {
  return new Date(start.getTime() + day * DAY).toISOString().slice(0, 10);
}

/** Per-day inflows/outflows across the semester, kept separate so monthly
 * in-vs-out bars don't net same-day events against each other. */
function dailyFlows(
  s: ForecastSettings,
  items: ForecastItem[]
): { start: Date; end: Date; inflows: number[]; outflows: number[] } | null {
  const start = parseUTC(s.semester_start);
  const end = parseUTC(s.semester_end);
  if (!start || !end || end.getTime() <= start.getTime()) return null;
  const totalDays = Math.round((end.getTime() - start.getTime()) / DAY);
  const inflows = new Array<number>(totalDays + 1).fill(0);
  const outflows = new Array<number>(totalDays + 1).fill(0);

  // Day one: bank balance plus dues already collected.
  inflows[0] += s.starting_balance + s.dues_collected;

  // Remaining dues arrive per the chapter's collection schedule.
  const remainingDues = Math.max(
    0,
    revenueFor(s, s.pledges_expected) - s.dues_collected
  );
  const schedule = s.dues_schedule ?? "sixweek";
  if (schedule === "upfront") {
    inflows[0] += remainingDues;
  } else if (schedule === "monthly") {
    // Equal installments: semester start, then the 1st of each later month.
    const installmentDays = [0];
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)
    );
    while (cursor.getTime() <= end.getTime()) {
      installmentDays.push(
        Math.round((cursor.getTime() - start.getTime()) / DAY)
      );
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    for (const d of installmentDays)
      inflows[d] += remainingDues / installmentDays.length;
  } else if (schedule === "thirds") {
    // ⅓ deposit, then two monthly installments.
    for (const d of [0, 30, 60]) {
      inflows[Math.min(d, totalDays)] += remainingDues / 3;
    }
  } else {
    const ramp = Math.min(DUES_RAMP_DAYS, totalDays);
    for (let d = 0; d <= ramp; d++) inflows[d] += remainingDues / (ramp + 1);
  }

  const clampDay = (ds: string | null): number => {
    const dt = ds ? parseUTC(ds) : null;
    if (!dt) return 0;
    return Math.min(
      totalDays,
      Math.max(0, Math.round((dt.getTime() - start.getTime()) / DAY))
    );
  };

  for (const item of items) {
    const bucket = item.type === "other_income" ? inflows : outflows;
    // Per-member costs are a single per-semester total (rate × headcount).
    const amount =
      item.type === "variable_expense"
        ? itemSemesterCost(item, s)
        : effectiveAmount(item);
    // A deposit/balance split places each dated part separately — but only on
    // the PLANNED amount: once a real cost is known (actual_amount) the parts no
    // longer add up, so we fall back to a single hit on the item's date.
    const schedule =
      item.actual_amount == null &&
      item.frequency !== "monthly" &&
      item.schedule &&
      item.schedule.length > 0
        ? item.schedule
        : null;
    if (schedule) {
      for (const p of schedule) bucket[clampDay(p.date)] += p.amount;
    } else if (item.frequency === "monthly") {
      const dayOfMonth = item.date ? Number(item.date.slice(8, 10)) : 1;
      const cursor = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
      );
      while (cursor.getTime() <= end.getTime()) {
        const daysInMonth = new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)
        ).getUTCDate();
        const hit = Date.UTC(
          cursor.getUTCFullYear(),
          cursor.getUTCMonth(),
          Math.min(dayOfMonth, daysInMonth)
        );
        // Clamp into the window instead of dropping — keeps the curve's
        // total in step with occurrences(), which counts calendar months.
        const hitDay = Math.min(
          totalDays,
          Math.max(0, Math.round((hit - start.getTime()) / DAY))
        );
        bucket[hitDay] += amount;
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    } else {
      bucket[clampDay(item.date)] += amount;
    }
  }

  return { start, end, inflows, outflows };
}

export function buildCashCurve(
  s: ForecastSettings,
  items: ForecastItem[]
): CashCurve | null {
  const base = dailyFlows(s, items);
  if (!base) return null;
  const { start, inflows, outflows } = base;
  const totalDays = inflows.length - 1;

  const points: CashPoint[] = [];
  let balance = 0;
  let min: CashPoint = { day: 0, date: isoAt(start, 0), balance: Infinity };
  for (let d = 0; d <= totalDays; d++) {
    balance += inflows[d] - outflows[d];
    if (balance < min.balance) min = { day: d, date: isoAt(start, d), balance };
    if (d % 7 === 0 || d === totalDays) {
      points.push({ day: d, date: isoAt(start, d), balance });
    }
  }

  const monthTicks: { day: number; label: string }[] = [];
  for (let d = 0; d <= totalDays; d++) {
    const dt = new Date(start.getTime() + d * DAY);
    if (d === 0 || dt.getUTCDate() === 1) {
      monthTicks.push({
        day: d,
        label: dt.toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
      });
    }
  }

  return { points, min, end: points[points.length - 1], monthTicks, totalDays };
}

export function monthlyFlows(
  s: ForecastSettings,
  items: ForecastItem[]
): MonthFlow[] {
  const base = dailyFlows(s, items);
  if (!base) return [];
  const { start, inflows, outflows } = base;
  const flows = new Map<string, MonthFlow>();
  for (let d = 0; d < inflows.length; d++) {
    const dt = new Date(start.getTime() + d * DAY);
    const key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`;
    if (!flows.has(key)) {
      flows.set(key, {
        label: dt.toLocaleDateString("en-US", {
          month: "short",
          timeZone: "UTC",
        }),
        income: 0,
        spend: 0,
      });
    }
    const f = flows.get(key)!;
    // Day-one inflow includes the starting bank balance — a holding, not a
    // flow. Strip it so the chart shows money moving, not money sitting.
    f.income += d === 0 ? inflows[0] - s.starting_balance : inflows[d];
    f.spend += outflows[d];
  }
  return Array.from(flows.values());
}

/** Compact money for chart labels: $12.7k, $980, -$1.2k. */
export function fmtUSDk(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}$${k >= 100 ? Math.round(k) : k.toFixed(1)}k`;
  }
  return `${sign}$${Math.round(abs)}`;
}
