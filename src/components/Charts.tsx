/**
 * Hand-rolled SVG charts for the dashboard — server-rendered, no chart
 * library. Colors come from the design tokens via CSS variables.
 */
import { CashCurve, MonthFlow, fmtUSDk } from "@/lib/cashflow";
import { fmtDate } from "@/lib/forecast";

const CURVE_W = 640;
const CURVE_H = 240;
const PAD = { l: 50, r: 16, t: 18, b: 28 };

export function CashCurveChart({
  curve,
  reserveTarget,
}: {
  curve: CashCurve;
  reserveTarget: number;
}) {
  const plotW = CURVE_W - PAD.l - PAD.r;
  const plotH = CURVE_H - PAD.t - PAD.b;

  const balances = curve.points.map((p) => p.balance);
  let lo = Math.min(0, curve.min.balance);
  let hi = Math.max(...balances, reserveTarget, 0);
  const span = Math.max(hi - lo, 1);
  hi += span * 0.08;
  if (lo < 0) lo -= span * 0.08;

  const x = (day: number) => PAD.l + (day / curve.totalDays) * plotW;
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * plotH;

  const line = curve.points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day).toFixed(1)},${y(p.balance).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(curve.totalDays).toFixed(1)},${y(Math.max(0, lo)).toFixed(1)} L${x(0).toFixed(1)},${y(Math.max(0, lo)).toFixed(1)} Z`;

  const gridValues = [hi - span * 0.08, (hi - span * 0.08 + Math.max(0, lo)) / 2];
  const dipsNegative = curve.min.balance < 0;

  return (
    <svg
      viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Projected cash balance across the semester"
    >
      <defs>
        <linearGradient id="cashArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
        <filter id="cashGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* horizontal gridlines */}
      {gridValues.map((v) => (
        <g key={v}>
          <line
            x1={PAD.l} x2={CURVE_W - PAD.r} y1={y(v)} y2={y(v)}
            stroke="var(--border)" strokeWidth="1"
          />
          <text
            x={PAD.l - 8} y={y(v) + 3.5}
            textAnchor="end" fontSize="10.5" fill="var(--muted-foreground)"
            fontFamily="var(--font-mono)"
          >
            {fmtUSDk(v)}
          </text>
        </g>
      ))}

      {/* zero line, only interesting when the curve can dip */}
      <line
        x1={PAD.l} x2={CURVE_W - PAD.r} y1={y(0)} y2={y(0)}
        stroke={dipsNegative ? "var(--destructive)" : "var(--border)"}
        strokeWidth="1" strokeDasharray={dipsNegative ? "4 3" : undefined}
      />
      <text
        x={PAD.l - 8} y={y(0) + 3.5}
        textAnchor="end" fontSize="10.5" fill="var(--muted-foreground)"
        fontFamily="var(--font-mono)"
      >
        $0
      </text>

      {/* reserve target */}
      {reserveTarget > 0 && (
        <g>
          <line
            x1={PAD.l} x2={CURVE_W - PAD.r} y1={y(reserveTarget)} y2={y(reserveTarget)}
            stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="2 4" opacity="0.7"
          />
          <text
            x={CURVE_W - PAD.r} y={y(reserveTarget) - 5}
            textAnchor="end" fontSize="10" fill="var(--muted-foreground)"
            fontFamily="var(--font-mono)"
          >
            reserve {fmtUSDk(reserveTarget)}
          </text>
        </g>
      )}

      {/* month ticks */}
      {curve.monthTicks.map((t) => (
        <text
          key={t.day} x={x(t.day)} y={CURVE_H - 8}
          fontSize="10.5" fill="var(--muted-foreground)"
        >
          {t.label}
        </text>
      ))}

      {/* the curve */}
      <path d={area} fill="url(#cashArea)" />
      <path
        d={line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        filter="url(#cashGlow)"
      />

      {/* low point */}
      <circle
        cx={x(curve.min.day)} cy={y(curve.min.balance)} r="4"
        fill={dipsNegative ? "var(--destructive)" : "var(--primary)"}
        stroke="var(--card)" strokeWidth="2"
      />
      <text
        x={Math.min(x(curve.min.day) + 8, CURVE_W - 150)}
        y={Math.max(y(curve.min.balance) - 8, 14)}
        fontSize="11" fontWeight="600"
        fontFamily="var(--font-mono)"
        fill={dipsNegative ? "var(--destructive)" : "var(--foreground)"}
      >
        low {fmtUSDk(curve.min.balance)} · {fmtDate(curve.min.date)}
      </text>

      {/* end point */}
      <circle
        cx={x(curve.end.day)} cy={y(curve.end.balance)} r="4"
        fill="var(--primary)" stroke="var(--card)" strokeWidth="2"
      />
      <text
        x={x(curve.end.day) - 8} y={y(curve.end.balance) - 10}
        textAnchor="end" fontSize="11" fontWeight="600"
        fontFamily="var(--font-mono)" fill="var(--foreground)"
      >
        end {fmtUSDk(curve.end.balance)}
      </text>
    </svg>
  );
}

const BARS_W = 320;
const BARS_H = 240;
const BPAD = { l: 10, r: 10, t: 30, b: 26 };

export function MonthlyFlowChart({ months }: { months: MonthFlow[] }) {
  const plotW = BARS_W - BPAD.l - BPAD.r;
  const plotH = BARS_H - BPAD.t - BPAD.b;
  const max = Math.max(...months.map((m) => Math.max(m.income, m.spend)), 1);
  const group = plotW / months.length;
  const barW = Math.min(22, group * 0.32);

  const h = (v: number) => (v / max) * plotH;

  return (
    <svg
      viewBox={`0 0 ${BARS_W} ${BARS_H}`}
      className="mx-auto h-auto w-full max-w-sm"
      role="img"
      aria-label="Money in versus money out by month"
    >
      {/* legend */}
      <g fontSize="10.5" fill="var(--muted-foreground)">
        <circle cx={BARS_W - 104} cy={12} r="4" fill="var(--primary)" />
        <text x={BARS_W - 96} y={15.5}>In</text>
        <circle cx={BARS_W - 64} cy={12} r="4" fill="var(--warning)" />
        <text x={BARS_W - 56} y={15.5}>Out</text>
      </g>

      <line
        x1={BPAD.l} x2={BARS_W - BPAD.r}
        y1={BARS_H - BPAD.b} y2={BARS_H - BPAD.b}
        stroke="var(--border)" strokeWidth="1"
      />

      {months.map((m, i) => {
        const cx = BPAD.l + group * i + group / 2;
        const base = BARS_H - BPAD.b;
        return (
          <g key={m.label}>
            <title>{`${m.label}: ${fmtUSDk(m.income)} in · ${fmtUSDk(m.spend)} out`}</title>
            <rect
              x={cx - barW - 2} y={base - h(m.income)}
              width={barW} height={h(m.income)}
              rx="3" fill="var(--primary)"
            />
            <rect
              x={cx + 2} y={base - h(m.spend)}
              width={barW} height={h(m.spend)}
              rx="3" fill="var(--warning)"
            />
            <text
              x={cx} y={BARS_H - 8}
              textAnchor="middle" fontSize="10.5" fill="var(--muted-foreground)"
            >
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
