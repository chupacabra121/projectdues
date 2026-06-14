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
  return Math.max(0, plans[aidPlan]?.amount ?? 0);
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
