import { describe, it, expect } from "vitest";
import { buildCashCurve } from "./cashflow";
import { ForecastSettings, ForecastItem } from "./forecast";

function settings(over: Partial<ForecastSettings> = {}): ForecastSettings {
  return {
    active_members: 0,
    current_pledges: 0,
    pledges_conservative: 0,
    pledges_expected: 0,
    pledges_optimistic: 0,
    active_dues: 0,
    pledge_dues: 0,
    collection_rate: 1,
    starting_balance: 0,
    dues_collected: 0,
    reserve_target: 0,
    semester_start: "2026-01-10",
    semester_end: "2026-05-15",
    ...over,
  };
}

function item(over: Partial<ForecastItem> & Pick<ForecastItem, "type" | "amount">): ForecastItem {
  return {
    name: "x",
    date: null,
    frequency: "one_time",
    category: "Other",
    ...over,
  } as ForecastItem;
}

/** Balance at the latest weekly sample on or before a given date. */
function balanceOn(
  curve: NonNullable<ReturnType<typeof buildCashCurve>>,
  iso: string
): number | null {
  let b: number | null = null;
  for (const p of curve.points) if (p.date <= iso) b = p.balance;
  return b;
}

describe("buildCashCurve — basics", () => {
  it("returns null for a degenerate window (end before start)", () => {
    const s = settings({ semester_start: "2026-05-15", semester_end: "2026-01-10" });
    expect(buildCashCurve(s, [])).toBeNull();
  });

  it("upfront dues land entirely on day 0", () => {
    const s = settings({
      active_dues_breakdown: { fullCount: 1, fullRate: 1000, aid: [] },
      dues_schedule: "upfront",
    });
    const curve = buildCashCurve(s, [])!;
    expect(curve.points[0].balance).toBe(1000);
    expect(curve.end.balance).toBe(1000);
    expect(curve.min.balance).toBe(1000);
  });

  it("an undated expense hits day 0", () => {
    const s = settings({ starting_balance: 1000 });
    const curve = buildCashCurve(s, [item({ type: "fixed_expense", amount: 500 })])!;
    expect(curve.end.balance).toBe(500);
    expect(curve.min.balance).toBe(500);
  });

  it("a monthly expense recurs once per calendar month of the semester", () => {
    const s = settings({ starting_balance: 1000 });
    // Jan15, Feb15, Mar15, Apr15, May15 → 5 hits × $100 = $500
    const curve = buildCashCurve(s, [
      item({ type: "fixed_expense", amount: 100, date: "2026-01-15", frequency: "monthly" }),
    ])!;
    expect(curve.end.balance).toBe(500);
  });
});

describe("buildCashCurve — deposit/balance split", () => {
  it("REGRESSION (bug 2): recording an actual scales the split to the real total and keeps each part on its own date", () => {
    const s = settings({ starting_balance: 20000, dues_schedule: "upfront" });
    // Planned $8k (deposit $2k Feb 1 + balance $6k Apr 15); real cost came in at $10k.
    const formal = item({
      type: "planned_event",
      amount: 8000,
      actual_amount: 10000,
      date: "2026-02-01",
      schedule: [
        { amount: 2000, date: "2026-02-01" },
        { amount: 6000, date: "2026-04-15" },
      ],
    });
    const curve = buildCashCurve(s, [formal])!;
    // factor = 10000/8000 = 1.25 → 2500 on Feb 1, 7500 on Apr 15
    expect(balanceOn(curve, "2026-03-15")).toBe(17500); // only the scaled deposit has hit
    expect(curve.end.balance).toBe(10000); // total outflow == the real $10k
  });

  it("with no actual, the split places exactly the planned amounts on their dates", () => {
    const s = settings({ starting_balance: 20000, dues_schedule: "upfront" });
    const formal = item({
      type: "planned_event",
      amount: 8000,
      date: "2026-02-01",
      schedule: [
        { amount: 2000, date: "2026-02-01" },
        { amount: 6000, date: "2026-04-15" },
      ],
    });
    const curve = buildCashCurve(s, [formal])!;
    expect(balanceOn(curve, "2026-03-15")).toBe(18000); // 20000 − 2000 deposit
    expect(curve.end.balance).toBe(12000); // 20000 − 8000
  });
});
