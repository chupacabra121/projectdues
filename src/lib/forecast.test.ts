import { describe, it, expect } from "vitest";
import {
  revenueFor,
  activeDuesGross,
  activeMemberCount,
  variableObligationsFor,
  occurrences,
  itemSemesterCost,
  buildForecast,
  ForecastSettings,
  ForecastItem,
} from "./forecast";

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
  return { name: "x", date: null, frequency: "one_time", category: "Other", ...over } as ForecastItem;
}

describe("revenue", () => {
  it("activeDuesGross = full tier + each aid member", () => {
    const s = settings({
      active_dues_breakdown: { fullCount: 2, fullRate: 100, aid: [{ name: "a", amount: 30 }, { name: "b", amount: 20 }] },
    });
    expect(activeDuesGross(s)).toBe(250); // 2×100 + 30 + 20
    expect(activeMemberCount(s)).toBe(4); // 2 full + 2 aid
  });

  it("revenueFor applies the collection rate to actives + pledges", () => {
    const s = settings({
      active_dues_breakdown: { fullCount: 10, fullRate: 100, aid: [] },
      pledge_dues: 50,
      collection_rate: 0.9,
    });
    // (1000 + 4×50) × 0.9 = 1080
    expect(revenueFor(s, 4)).toBe(1080);
  });

  it("custom tiers are billed at their OWN collection rate, on top", () => {
    const s = settings({
      active_dues_breakdown: { fullCount: 0, fullRate: 0, aid: [] },
      collection_rate: 1,
      custom_tier_breakdowns: [
        { catId: "t", label: "Alumni", color: "blue", fullCount: 4, fullRate: 100, aid: [], collectionRate: 0.5 },
      ],
    });
    // actives 0 + tier 4×100×0.5 = 200
    expect(revenueFor(s, 0)).toBe(200);
  });
});

describe("obligations", () => {
  it("variable cost headcount scales by basis and pledge class", () => {
    const s = settings({ active_members: 20 });
    const v = item({ type: "variable_expense", amount: 50, cost_basis: "member" });
    expect(variableObligationsFor([v], s, 5)).toBe(1250); // (20 actives + 5 pledges) × 50
    expect(variableObligationsFor([{ ...v, cost_basis: "brother" }], s, 5)).toBe(1000); // 20 × 50
    expect(variableObligationsFor([{ ...v, cost_basis: "pledge" }], s, 5)).toBe(250); // 5 × 50
  });

  it("monthly items recur once per calendar month of the semester", () => {
    const s = settings(); // Jan 10 – May 15 → Jan,Feb,Mar,Apr,May = 5
    const m = item({ type: "fixed_expense", amount: 100, frequency: "monthly" });
    expect(occurrences(m, s)).toBe(5);
    expect(itemSemesterCost(m, s)).toBe(500);
  });

  it("a known actual cost overrides the planned amount in the totals", () => {
    const s = settings();
    const f = item({ type: "fixed_expense", amount: 1000, actual_amount: 1200 });
    expect(itemSemesterCost(f, s)).toBe(1200);
  });
});

describe("buildForecast", () => {
  it("remainingBalance = bank + income − obligations − events", () => {
    const s = settings({
      starting_balance: 1000,
      active_dues_breakdown: { fullCount: 10, fullRate: 100, aid: [] },
      collection_rate: 1,
      pledges_expected: 0,
    });
    const items: ForecastItem[] = [
      item({ type: "fixed_expense", amount: 400 }),
      item({ type: "planned_event", amount: 300 }),
    ];
    const fc = buildForecast(s, items, {});
    // 1000 + 1000 revenue − 400 − 300 = 1300
    expect(fc.remainingBalance).toBe(1300);
  });

  it("REGRESSION (bug 4): the recruitment-downside insight matches the Conservative scenario card", () => {
    const s = settings({
      active_members: 20,
      pledges_conservative: 2,
      pledges_expected: 10,
      pledges_optimistic: 18,
      active_dues: 100,
      pledge_dues: 100,
      collection_rate: 1,
      active_dues_breakdown: { fullCount: 20, fullRate: 100, aid: [] },
    });
    const items: ForecastItem[] = [
      item({ type: "fixed_expense", amount: 1300 }),
      item({ type: "variable_expense", amount: 50, cost_basis: "member" }),
    ];
    const fc = buildForecast(s, items, {});
    const conservative = fc.scenarios.find((x) => x.label === "Conservative")!;
    expect(fc.remainingBalance).toBe(200); // expected scenario positive → insight fires
    expect(conservative.remainingBalance).toBe(-200); // includes variable obligations
    const downside = fc.insights.find((i) => /conservative estimate/.test(i.text));
    expect(downside).toBeDefined();
    expect(downside!.text).toContain("$200"); // quotes the same deficit as the card
  });
});
