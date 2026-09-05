import {
  ForecastItem,
  ForecastSettings,
  remainingAtRates,
  brotherCollectionRate,
  pledgeCollectionRate,
  fmtUSD,
} from "@/lib/forecast";

const BROTHER_STEPS = [1, 0.9, 0.8, 0.7, 0.6];
const PLEDGE_STEPS = [1, 0.8, 0.6, 0.4, 0.2];

/**
 * Build a rate axis: the fixed steps plus the period's own rate, so the current
 * position always appears on the grid. Sorted high to low, near-duplicates of
 * the actual rate dropped so it isn't listed twice.
 */
function axis(steps: number[], actual: number): number[] {
  const kept = steps.filter((v) => Math.abs(v - actual) > 0.02);
  return [...kept, actual].sort((a, b) => b - a);
}

const pct = (n: number) => `${(n * 100).toFixed(n * 100 % 1 === 0 ? 0 : 1)}%`;

export default function CollectionGrid({
  settings,
  items,
}: {
  settings: ForecastSettings;
  items: ForecastItem[];
}) {
  const bActual = brotherCollectionRate(settings);
  const pActual = pledgeCollectionRate(settings);
  const rows = axis(BROTHER_STEPS, bActual);
  const cols = axis(PLEDGE_STEPS, pActual);
  const reserve = settings.reserve_target;

  return (
    <section className="glass mt-8 rounded-[1.5rem] p-6">
      <h2 className="font-display text-xl text-foreground">
        Collection sensitivity
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        Costs, events and headcount are held constant — the only thing changing
        is how much of what you billed actually arrives. Each cell is the
        projected end balance. Your current position is outlined.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-sm">
          <caption className="sr-only">
            Projected end balance by brother and new-member collection rate
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-b border-border px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Brothers ↓ / New members →
              </th>
              {cols.map((c) => {
                const isActual = c === pActual;
                return (
                  <th
                    key={c}
                    scope="col"
                    className={`border-b border-border px-3 py-2 text-right text-xs font-semibold tabular-nums ${
                      isActual ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {pct(c)}
                    {isActual && (
                      <span className="block text-[0.65rem] font-normal">now</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rowActual = r === bActual;
              return (
                <tr key={r}>
                  <th
                    scope="row"
                    className={`border-b border-border/60 px-3 py-2 text-left text-xs font-semibold tabular-nums ${
                      rowActual ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {pct(r)}
                    {rowActual && (
                      <span className="ml-1 text-[0.65rem] font-normal">now</span>
                    )}
                  </th>
                  {cols.map((c) => {
                    const value = remainingAtRates(settings, items, r, c);
                    // Three bands: covers the reserve, merely solvent, short.
                    const tone =
                      value < 0
                        ? "text-money-down"
                        : reserve > 0 && value < reserve
                          ? "text-warning"
                          : "text-money-up";
                    const here = rowActual && c === pActual;
                    return (
                      <td
                        key={c}
                        className={`border-b border-border/60 px-3 py-2 text-right tabular-nums ${tone} ${
                          here
                            ? "rounded-md font-semibold outline outline-2 outline-offset-[-2px] outline-primary"
                            : ""
                        }`}
                      >
                        {fmtUSD(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-money-up">Green</span> keeps the{" "}
          {fmtUSD(reserve)} reserve intact
        </span>
        {reserve > 0 && (
          <span>
            <span className="font-medium text-warning">Amber</span> solvent but
            eats into the reserve
          </span>
        )}
        <span>
          <span className="font-medium text-money-down">Red</span> ends the
          semester short
        </span>
      </p>
    </section>
  );
}
