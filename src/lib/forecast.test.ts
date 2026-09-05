import { describe, it, expect } from "vitest";
import {
  revenueFor,
  activeDuesGross,
  activeMemberCount,
  variableObligationsFor,
  occurrences,
  itemSemesterCost,
  buildForecast,
  brotherCollectionRate,
  pledgeCollectionRate,
  grossDuesBilled,
  blendedCollectionRate,
  breakEvenCollectionRate,
  remainingAtRates,
  breakdownTotal,
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

describe("per-tier collection rates", () => {
  // Fall 2026: 21 brothers at $1,380 + 2 on $600 aid + 10 new members at $1,380,
  // collected at Spring's actual rates (brothers 11/15, pledges 6/14).
  const fall = () =>
    settings({
      active_dues_breakdown: {
        fullCount: 21,
        fullRate: 1380,
        aid: [
          { name: "Ahmed", amount: 600 },
          { name: "Benedek", amount: 600 },
        ],
      },
      active_members: 23,
      pledge_dues: 1380,
      pledges_expected: 10,
      collection_rate: 0.5, // deliberately wrong — the tier rates must win
      brother_collection_rate: 11 / 15,
      pledge_collection_rate: 6 / 14,
    });

  it("falls back to the blended rate when neither tier rate is set", () => {
    const s = settings({ collection_rate: 0.8 });
    expect(brotherCollectionRate(s)).toBe(0.8);
    expect(pledgeCollectionRate(s)).toBe(0.8);
  });

  it("a tier rate of 0 is honoured, not treated as missing", () => {
    const s = settings({ collection_rate: 0.9, pledge_collection_rate: 0 });
    expect(pledgeCollectionRate(s)).toBe(0);
    expect(brotherCollectionRate(s)).toBe(0.9);
  });

  it("clamps rates outside 0..1", () => {
    expect(brotherCollectionRate(settings({ collection_rate: 1.4 }))).toBe(1);
    expect(pledgeCollectionRate(settings({ collection_rate: -0.2 }))).toBe(0);
  });

  it("bills each tier at its own rate", () => {
    const s = fall();
    expect(grossDuesBilled(s, 10)).toBe(43980); // 21×1380 + 1200 + 10×1380
    // brothers 30,180 × 11/15 = 22,132 · pledges 13,800 × 6/14 = 5,914.29
    expect(revenueFor(s, 10)).toBeCloseTo(28046.29, 2);
  });

  it("blended rate is an output of the tier mix", () => {
    expect(blendedCollectionRate(fall(), 10)).toBeCloseTo(28046.29 / 43980, 6);
  });

  it("break-even is the rate that leaves exactly zero", () => {
    const s = { ...fall(), reserve_target: 1000 };
    const items = [
      item({ type: "fixed_expense", amount: 17687.5 }),
      item({ type: "planned_event", amount: 16989.97 }),
      item({ type: "other_income", amount: 1000 }),
    ];
    const be = breakEvenCollectionRate(s, items, 10);
    expect(be).toBeCloseTo((17687.5 + 16989.97 + 1000 - 1000) / 43980, 6);

    // Applying that rate to both tiers must land the semester on zero.
    const atBreakEven = { ...s, brother_collection_rate: be, pledge_collection_rate: be };
    const f = buildForecast(atBreakEven, items);
    expect(f.remainingBalance - s.reserve_target).toBeCloseTo(0, 6);
  });

  it("remainingAtRates holds costs constant and varies only collection", () => {
    const s = fall();
    const items = [
      item({ type: "fixed_expense", amount: 17687.5 }),
      item({ type: "planned_event", amount: 16989.97 }),
      item({ type: "other_income", amount: 1000 }),
    ];
    // Full collection: everything billed arrives.
    expect(remainingAtRates(s, items, 1, 1)).toBeCloseTo(
      43980 + 1000 - 17687.5 - 16989.97,
      2
    );
    // Nobody pays: only the other income is left against the same costs.
    expect(remainingAtRates(s, items, 0, 0)).toBeCloseTo(
      1000 - 17687.5 - 16989.97,
      2
    );
    // At the period's own rates it agrees with the full forecast.
    expect(remainingAtRates(s, items, 11 / 15, 6 / 14)).toBeCloseTo(
      buildForecast(s, items).remainingBalance,
      6
    );
  });

  it("buildForecast surfaces gross, blended and break-even", () => {
    const f = buildForecast(fall(), []);
    expect(f.grossDuesBilled).toBe(43980);
    expect(f.blendedCollectionRate).toBeCloseTo(0.637706, 5);
    expect(f.breakEvenRate).toBe(0); // no costs, no reserve
  });
});

describe("supporting schedules", () => {
  it("sums quantity x rate lines", () => {
    expect(
      breakdownTotal([
        { label: "bays", qty: 8, rate: 85 },
        { label: "food", qty: 40, rate: 35 },
      ])
    ).toBe(2080);
  });

  it("applies a percentage line to the quantity subtotal above it", () => {
    // Josh's rush golf event: 8 x $85 + 40 x $35, then a 25% service charge.
    expect(
      breakdownTotal([
        { label: "bays", qty: 8, rate: 85 },
        { label: "food", qty: 40, rate: 35 },
        { label: "service charge", pct: 0.25 },
      ])
    ).toBe(2600);
  });

  it("percentage lines compound on the quantity subtotal, not on each other", () => {
    const t = breakdownTotal([
      { label: "base", qty: 1, rate: 100 },
      { label: "service", pct: 0.2 },
      { label: "tax", pct: 0.1 },
    ]);
    expect(t).toBe(130); // 100 + 20 + 10, not 100 + 20 + 12
  });

  it("a percentage line before any quantity line contributes nothing", () => {
    expect(breakdownTotal([{ label: "tax", pct: 0.25 }])).toBe(0);
  });

  it("treats missing and empty schedules as zero", () => {
    expect(breakdownTotal(null)).toBe(0);
    expect(breakdownTotal([])).toBe(0);
  });

  it("rounds to cents", () => {
    expect(breakdownTotal([{ label: "soda", qty: 2, rate: 21.29 }])).toBe(42.58);
  });

  it("reproduces the full rush schedule", () => {
    expect(
      breakdownTotal([
        { label: "Golf bays", qty: 8, rate: 85 },
        { label: "Food & drinks", qty: 40, rate: 35 },
        { label: "Service charge", pct: 0.25 },
        { label: "Wings", qty: 1, rate: 75.6 },
        { label: "Soda", qty: 2, rate: 21.29 },
        { label: "Chips", qty: 1, rate: 21.79 },
      ])
    ).toBe(2739.97);
  });
});
