/**
 * Per-member dues model, shared by the Dues tab (client), the budget, and the
 * server actions. Kept DB-free so it's safe in the client bundle.
 *
 * A member pays the *set rate* for their status (active_dues / pledge_dues)
 * unless they're on a financial-aid plan. A plan carries a preset amount that
 * a member can override individually.
 */

export interface DuesPlan {
  name: string;
  amount: number;
}

export const DEFAULT_DUES_PLANS: DuesPlan[] = [
  { name: "Plan 1", amount: 0 },
  { name: "Plan 2", amount: 0 },
];

/** Hard cap on configurable plans, to keep the JSON small and the UI sane. */
export const MAX_DUES_PLANS = 4;

/**
 * A member's effective dues for the semester. An individual override (aidAmount)
 * always wins — including for full-dues members. Otherwise: a plan member pays
 * the plan's preset; everyone else pays the set rate for their status.
 */
export function memberEffectiveDues(
  aidPlan: number | null,
  aidAmount: number | null,
  plans: DuesPlan[],
  setRate: number
): number {
  if (aidAmount != null) return Math.max(0, aidAmount);
  if (aidPlan == null) return Math.max(0, setRate);
  // A dangling plan index (e.g. the plan was deleted) reverts the member to
  // their status rate — never silently to $0.
  const plan = plans[aidPlan];
  return Math.max(0, plan ? plan.amount : setRate);
}

/**
 * A member's dues given their status and the period's rates/plans. Only actives
 * and pledges owe dues; alumni/inactive owe nothing.
 */
export function memberDuesAmount(
  status: string,
  aidPlan: number | null,
  aidAmount: number | null,
  plans: DuesPlan[],
  activeRate: number,
  pledgeRate: number
): number {
  if (status === "brother") return memberEffectiveDues(aidPlan, aidAmount, plans, activeRate);
  if (status === "pledge") return memberEffectiveDues(aidPlan, aidAmount, plans, pledgeRate);
  return 0;
}

/* ── Custom member categories (tags) ─────────────────────────────────────────
 * Tags are layered ON TOP of a member's base status. Each category can carry a
 * dues rule that overrides the member's set rate within their dues tier. */

/** How a custom category prices its members. "inherit" = organizational-only. */
export type DuesRule = "inherit" | "none" | "full" | "pledge" | "custom";

export interface CustomCategory {
  id: string;
  name: string;
  /** A token from CATEGORY_COLOR_TOKENS — never raw hex, so chips theme correctly. */
  color: string;
  dues: { rule: DuesRule; amount: number };
  /**
   * Promoted to a first-class TIER (a peer of Brother/Pledge): it gets its own
   * roster card and its own budget/forecast revenue line, and it bills its
   * members regardless of base status — so a dues-paying alumnus is possible.
   * A plain tag (tier falsy) only re-prices brothers/pledges within their tier.
   */
  tier?: boolean;
  /** Display label for the tier's roster card / budget line, e.g. "Associates". */
  plural?: string;
  /** This tier's own collection rate (0..1); falls back to the period's rate. */
  collectionRate?: number;
}

/** Hard cap on custom categories, to keep the JSON small and the UI sane. */
export const MAX_CUSTOM_CATEGORIES = 12;

/** Allowed chip color tokens (mapped to Tailwind classes in the roster UI). */
export const CATEGORY_COLOR_TOKENS = [
  "mint",
  "blue",
  "violet",
  "amber",
  "rose",
  "slate",
] as const;
export type CategoryColor = (typeof CATEGORY_COLOR_TOKENS)[number];

/** Resolve a dues rule to a dollar set-rate. "inherit" yields 0 (no own rate). */
function rateForRule(
  rule: DuesRule,
  amount: number,
  activeRate: number,
  pledgeRate: number
): number {
  switch (rule) {
    case "none":
      return 0;
    case "full":
      return Math.max(0, activeRate);
    case "pledge":
      return Math.max(0, pledgeRate);
    case "custom":
      return Math.max(0, amount);
    default:
      return 0; // inherit — no own rate
  }
}

/**
 * The promoted TIER a member belongs to: the first dues-bearing category with
 * `tier` set among their tags, or null. A tier overrides the base status for
 * both pricing and bucketing, so a tagged alumnus is billed as their tier.
 * Orphan-tolerant — unknown ids are ignored.
 */
export function memberTier(
  tags: string[],
  cats: CustomCategory[]
): CustomCategory | null {
  return (
    cats.find((c) => c.tier && c.dues.rule !== "inherit" && tags.includes(c.id)) ??
    null
  );
}

/**
 * The dues "set rate" for a member. Precedence:
 *  1. a promoted TIER tag prices the member regardless of base status;
 *  2. otherwise, only brothers/pledges owe dues, and a plain (non-tier)
 *     dues-bearing tag re-prices them within their tier;
 *  3. else the flat status rate.
 * Unknown tag ids are ignored (orphan-tolerant).
 */
export function memberSetRate(
  status: string,
  tags: string[],
  cats: CustomCategory[],
  activeRate: number,
  pledgeRate: number
): number {
  const tier = memberTier(tags, cats);
  if (tier) return rateForRule(tier.dues.rule, tier.dues.amount, activeRate, pledgeRate);
  if (status !== "brother" && status !== "pledge") return 0;
  const tag = cats.find(
    (c) => !c.tier && c.dues.rule !== "inherit" && tags.includes(c.id)
  );
  if (tag) return rateForRule(tag.dues.rule, tag.dues.amount, activeRate, pledgeRate);
  return Math.max(0, status === "brother" ? activeRate : pledgeRate);
}

/** Full effective dues for a member, tag-aware. aidAmount > aidPlan > tag > status. */
export function memberDuesWithTags(
  status: string,
  tags: string[],
  cats: CustomCategory[],
  aidPlan: number | null,
  aidAmount: number | null,
  plans: DuesPlan[],
  activeRate: number,
  pledgeRate: number
): number {
  return memberEffectiveDues(
    aidPlan,
    aidAmount,
    plans,
    memberSetRate(status, tags, cats, activeRate, pledgeRate)
  );
}

/**
 * True if a non-tier dues tag re-prices this member — used to itemize them in
 * the brother breakdown's aid[] list. Tier members are bucketed separately, so
 * their tags don't count here.
 */
export function hasRepricingTag(tags: string[], cats: CustomCategory[]): boolean {
  return cats.some(
    (c) => !c.tier && c.dues.rule !== "inherit" && tags.includes(c.id)
  );
}

/**
 * A member who owes dues: a brother, a pledge, or anyone in a promoted tier.
 * Trash is never billable — this mirrors recomputeDerivedDues (which excludes
 * trash) so the client billable set can't diverge from the materialized totals.
 */
export function isBillableMember(
  status: string,
  tags: string[],
  cats: CustomCategory[]
): boolean {
  if (status === "trash") return false;
  return (
    status === "brother" ||
    status === "pledge" ||
    memberTier(tags, cats) != null
  );
}

/** The category currently pricing a member's dues, if any (for UI hints). */
export function pricingCategory(
  status: string,
  tags: string[],
  cats: CustomCategory[]
): CustomCategory | null {
  const tier = memberTier(tags, cats);
  if (tier) return tier;
  if (status !== "brother" && status !== "pledge") return null;
  return (
    cats.find((c) => !c.tier && c.dues.rule !== "inherit" && tags.includes(c.id)) ??
    null
  );
}
