import { describe, it, expect } from "vitest";
import { memberEffectiveDues, memberDuesAmount, DuesPlan } from "./memberDues";

const plans: DuesPlan[] = [
  { name: "Half", amount: 300 },
  { name: "Quarter", amount: 400 },
];

describe("memberEffectiveDues — precedence", () => {
  it("individual aid amount wins over everything", () => {
    expect(memberEffectiveDues(1, 50, plans, 650)).toBe(50);
  });
  it("a plan index resolves to that plan's preset", () => {
    expect(memberEffectiveDues(0, null, plans, 650)).toBe(300);
    expect(memberEffectiveDues(1, null, plans, 650)).toBe(400);
  });
  it("no plan and no aid → the status set rate", () => {
    expect(memberEffectiveDues(null, null, plans, 650)).toBe(650);
  });
  it("REGRESSION (bug 1): a dangling/out-of-range plan index reverts to the set rate, never $0", () => {
    expect(memberEffectiveDues(5, null, plans, 650)).toBe(650);
    expect(memberEffectiveDues(2, null, plans, 650)).toBe(650);
  });
  it("never returns a negative number", () => {
    expect(memberEffectiveDues(null, -100, plans, 650)).toBe(0);
    expect(memberEffectiveDues(null, null, plans, -50)).toBe(0);
  });
});

describe("memberDuesAmount — only brothers and pledges owe dues", () => {
  it("brother pays the active rate", () => {
    expect(memberDuesAmount("brother", null, null, plans, 650, 400)).toBe(650);
  });
  it("pledge pays the pledge rate", () => {
    expect(memberDuesAmount("pledge", null, null, plans, 650, 400)).toBe(400);
  });
  it("alumni / inactive / trash owe nothing", () => {
    expect(memberDuesAmount("alumni", null, null, plans, 650, 400)).toBe(0);
    expect(memberDuesAmount("inactive", null, null, plans, 650, 400)).toBe(0);
    expect(memberDuesAmount("trash", null, null, plans, 650, 400)).toBe(0);
  });
  it("a brother on a deleted plan still owes the active rate (not $0)", () => {
    expect(memberDuesAmount("brother", 9, null, plans, 650, 400)).toBe(650);
  });
});
