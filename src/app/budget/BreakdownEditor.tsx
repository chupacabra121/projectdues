"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Percent } from "lucide-react";
import { setItemBreakdown } from "@/app/actions/budget";
import {
  ScheduleLine,
  breakdownTotal,
  scheduleLineValue,
  isPctLine,
} from "@/lib/forecast";

/** Cents matter in a build-up, so this doesn't round the way fmtUSD does. */
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const num = (v: string) => {
  const n = parseFloat(v);
  return isNaN(n) || n < 0 ? 0 : n;
};

const cell =
  "w-full rounded-lg border border-input bg-background px-2 py-1 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40";

/**
 * The build-up behind a single budget figure: quantity x rate lines, plus
 * percentage lines (service charge, gratuity, tax) that apply to the quantity
 * subtotal above them. The item's amount is re-derived from this on save.
 */
export default function BreakdownEditor({
  itemId,
  initial,
  fallbackAmount,
  onClose,
}: {
  itemId: number;
  initial: ScheduleLine[] | null;
  fallbackAmount: number;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<ScheduleLine[]>(
    initial && initial.length
      ? initial
      : [{ label: "", qty: 1, rate: fallbackAmount }]
  );
  const [isPending, startTransition] = useTransition();

  const patch = (i: number, next: Partial<ScheduleLine>) =>
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...next } : l)));
  const remove = (i: number) => setLines((prev) => prev.filter((_, j) => j !== i));

  const total = breakdownTotal(lines);
  // Each line's own value, carrying the running quantity subtotal forward so a
  // percentage line prices off the lines above it. Folded immutably — the React
  // Compiler rejects reassignment during render.
  const values = lines.reduce<{ vals: number[]; base: number }>(
    (acc, l) => {
      const v = scheduleLineValue(l, acc.base);
      return {
        vals: [...acc.vals, v],
        base: isPctLine(l) ? acc.base : acc.base + v,
      };
    },
    { vals: [], base: 0 }
  ).vals;

  const save = () => {
    const fd = new FormData();
    fd.set("id", String(itemId));
    fd.set("breakdown", JSON.stringify(lines.filter((l) => l.label.trim() !== "")));
    startTransition(async () => {
      await setItemBreakdown(fd);
      onClose();
    });
  };

  const clear = () => {
    const fd = new FormData();
    fd.set("id", String(itemId));
    fd.set("breakdown", "");
    startTransition(async () => {
      await setItemBreakdown(fd);
      onClose();
    });
  };

  return (
    <div className="mt-2 rounded-2xl border border-primary/30 bg-accent/30 p-4">
      <p className="mb-3 text-xs text-muted-foreground">
        Break this figure into what it is actually made of. The item&apos;s
        amount becomes the total of these lines.
      </p>

      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={l.label}
              onChange={(e) => patch(i, { label: e.target.value })}
              placeholder={isPctLine(l) ? "Service charge" : "Line item"}
              aria-label="Line label"
              className={`${cell} flex-1`}
            />
            {isPctLine(l) ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={((l.pct ?? 0) * 100).toString()}
                  onChange={(e) => patch(i, { pct: num(e.target.value) / 100 })}
                  aria-label="Percent"
                  className={`${cell} w-20 text-right tabular-nums`}
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            ) : (
              <>
                <input
                  type="number"
                  min={0}
                  value={String(l.qty ?? 0)}
                  onChange={(e) => patch(i, { qty: num(e.target.value) })}
                  aria-label="Quantity"
                  className={`${cell} w-16 text-right tabular-nums`}
                />
                <span className="text-xs text-muted-foreground">×</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(l.rate ?? 0)}
                  onChange={(e) => patch(i, { rate: num(e.target.value) })}
                  aria-label="Rate"
                  className={`${cell} w-24 text-right tabular-nums`}
                />
              </>
            )}
            <span className="w-24 shrink-0 text-right font-money text-sm tabular-nums text-foreground">
              {money(values[i])}
            </span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 text-muted-foreground/40 transition-colors hover:text-destructive"
              title="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setLines((p) => [...p, { label: "", qty: 1, rate: 0 }])}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          <Plus className="h-3 w-3" /> Line
        </button>
        <button
          type="button"
          onClick={() => setLines((p) => [...p, { label: "", pct: 0 }])}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
          title="A percentage of the lines above it"
        >
          <Percent className="h-3 w-3" /> Charge
        </button>
        <span className="ml-auto font-money text-sm font-semibold tabular-nums text-foreground">
          Total {money(total)}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save schedule"}
        </button>
        {initial && initial.length > 0 && (
          <button
            type="button"
            onClick={clear}
            disabled={isPending}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
            title="Remove the schedule and keep the amount as typed"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
