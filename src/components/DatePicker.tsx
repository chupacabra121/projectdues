"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { inputCls } from "@/components/AuthShell";

/**
 * A themed calendar date field. Renders a trigger styled like an input plus a
 * hidden <input name={name}> so it submits with the surrounding form exactly
 * like a native date input — but clicking it pops out a month grid with
 * circular day cells. The popover is portaled to <body> with fixed positioning
 * so it can't be clipped by an `overflow-hidden` ancestor (e.g. the Budget
 * step cards).
 */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const POPOVER_H = 340; // approx, for the flip-up decision

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parseISO(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}

function prettyDate(s: string): string {
  const p = parseISO(s);
  if (!p) return "";
  return new Date(Date.UTC(p.y, p.m, p.d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Cells for a month grid: leading nulls pad to the first weekday, then days. */
function monthGrid(y: number, m: number): (number | null)[] {
  const firstWeekday = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  return cells;
}

type Pos = { left: number; top?: number; bottom?: number };

export default function DatePicker({
  name,
  defaultValue = "",
  placeholder = "Pick a date",
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos>({ left: 0, top: 0 });
  const parsed = parseISO(value);
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const p = parseISO(defaultValue);
    if (p) return { y: p.y, m: p.m };
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  function place() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dropUp = window.innerHeight - rect.bottom < POPOVER_H && rect.top > POPOVER_H;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 288 - 8));
    setPos(
      dropUp
        ? { left, bottom: window.innerHeight - rect.top + 6 }
        : { left, top: rect.bottom + 6 }
    );
  }

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = () => place();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const p = parseISO(value);
    const now = new Date();
    setView(p ? { y: p.y, m: p.m } : { y: now.getFullYear(), m: now.getMonth() });
    place();
    setOpen(true);
  }
  function shift(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  }
  function pick(d: number) {
    setValue(toISO(view.y, view.m, d));
    setOpen(false);
  }

  const now = new Date();
  const today = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
  const cells = monthGrid(view.y, view.m);

  return (
    <div className="relative" ref={triggerRef}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
      >
        <span className={value ? "text-foreground" : "text-muted-foreground/60"}>
          {value ? prettyDate(value) : placeholder}
        </span>
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom }}
            className="glass-elevated z-[60] w-72 rounded-2xl p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => shift(-1)}
                aria-label="Previous month"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-foreground">
                {MONTHS[view.m]} {view.y}
              </span>
              <button
                type="button"
                onClick={() => shift(1)}
                aria-label="Next month"
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="text-center text-[11px] font-medium text-muted-foreground">
                  {w}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) =>
                d === null ? (
                  <span key={i} className="aspect-square" />
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pick(d)}
                    className={`flex aspect-square w-full items-center justify-center rounded-full text-sm transition-colors ${
                      parsed && parsed.y === view.y && parsed.m === view.m && parsed.d === d
                        ? "bg-primary font-semibold text-primary-foreground"
                        : today.y === view.y && today.m === view.m && today.d === d
                          ? "text-foreground ring-1 ring-primary/50 hover:bg-muted"
                          : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {d}
                  </button>
                )
              )}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2">
              <button
                type="button"
                onClick={() => {
                  setValue(toISO(today.y, today.m, today.d));
                  setOpen(false);
                }}
                className="text-xs font-medium text-accent-foreground hover:underline"
              >
                Today
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    setValue("");
                    setOpen(false);
                  }}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
