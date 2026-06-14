"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X, Plus, Trash2, Tags } from "lucide-react";
import { setCustomCategories } from "@/app/actions/dues";
import {
  CustomCategory,
  DuesRule,
  CATEGORY_COLOR_TOKENS,
  MAX_CUSTOM_CATEGORIES,
} from "@/lib/memberDues";
import { inputCls } from "@/components/AuthShell";

const DUES_RULES: { value: DuesRule; label: string }[] = [
  { value: "inherit", label: "No dues effect" },
  { value: "none", label: "Exempt ($0)" },
  { value: "full", label: "Brother rate" },
  { value: "pledge", label: "Pledge rate" },
  { value: "custom", label: "Custom amount" },
];

const newId = () =>
  "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Toolbar entry point — opens the category manager. */
export function CategoryManagerButton({
  categories,
  defaultCollectionRate,
}: {
  categories: CustomCategory[];
  /** The period's overall collection rate (0..1) — prefilled when promoting a tier. */
  defaultCollectionRate: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Tags className="h-3.5 w-3.5" />
        Categories{categories.length ? ` · ${categories.length}` : ""}
      </button>
      {open && (
        <CategoryModal
          initial={categories}
          defaultCollectionRate={defaultCollectionRate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const pctOf = (rate: number | undefined) =>
  rate == null ? "" : String(Math.round(rate * 100));
const clampPct = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) : 0;
};

function CategoryModal({
  initial,
  defaultCollectionRate,
  onClose,
}: {
  initial: CustomCategory[];
  defaultCollectionRate: number;
  onClose: () => void;
}) {
  const [cats, setCats] = useState<CustomCategory[]>(initial);
  // catsRef mirrors state synchronously so blur-saves never read a stale closure.
  const catsRef = useRef(cats);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Edit local state without saving yet (for typing into name / amount).
  const edit = (next: CustomCategory[]) => {
    catsRef.current = next;
    setCats(next);
  };
  // Persist the whole list (server sanitizes via parseCustomCategories).
  const persist = (next: CustomCategory[]) => {
    edit(next);
    const fd = new FormData();
    fd.set("categories", JSON.stringify(next));
    startTransition(() => setCustomCategories(fd));
  };
  const editAt = (i: number, p: Partial<CustomCategory>) =>
    catsRef.current.map((c, j) => (j === i ? { ...c, ...p } : c));
  const editDuesAt = (i: number, p: Partial<CustomCategory["dues"]>) =>
    catsRef.current.map((c, j) => (j === i ? { ...c, dues: { ...c.dues, ...p } } : c));
  const add = () =>
    persist([
      ...catsRef.current,
      { id: newId(), name: "", color: "mint", dues: { rule: "inherit", amount: 0 } },
    ]);
  const toggleTier = (i: number) => {
    const c = catsRef.current[i];
    const on = !c.tier;
    const patch: Partial<CustomCategory> = { tier: on };
    if (on) {
      patch.collectionRate = c.collectionRate ?? defaultCollectionRate;
      // A tier must bill — give it a billable rule if it's still organizational.
      if (c.dues.rule === "inherit") patch.dues = { rule: "custom", amount: c.dues.amount };
    }
    persist(editAt(i, patch));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-background/70 backdrop-blur-sm"
      />
      <div className="glass-elevated relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-4">
          <div>
            <h2 className="font-display text-2xl text-foreground">Member categories</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Custom tags to organize the roster. A category can also set its
              members&apos; dues.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {cats.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No categories yet. Add one to start tagging members.
            </p>
          )}
          <div className="space-y-3">
            {cats.map((c, i) => (
              <div
                key={c.id}
                className="rounded-2xl border border-border bg-card/40 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {/* Color swatches */}
                  <div className="flex items-center gap-1">
                    {CATEGORY_COLOR_TOKENS.map((color) => (
                      <button
                        key={color}
                        onClick={() => persist(editAt(i, { color }))}
                        aria-label={`Color ${color}`}
                        className={`cat-chip cat-${color} h-5 w-5 rounded-full transition-transform ${
                          c.color === color ? "ring-2 ring-ring ring-offset-1 ring-offset-background" : ""
                        }`}
                      />
                    ))}
                  </div>
                  <input
                    value={c.name}
                    onChange={(e) => edit(editAt(i, { name: e.target.value }))}
                    onBlur={() => persist(catsRef.current)}
                    placeholder="Category name"
                    className={`${inputCls} min-w-[8rem] flex-1`}
                    aria-label="Category name"
                  />
                  <button
                    onClick={() => persist(catsRef.current.filter((_, j) => j !== i))}
                    aria-label="Delete category"
                    className="rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-1">
                  <span className="text-xs text-muted-foreground">Dues</span>
                  <select
                    value={c.dues.rule}
                    onChange={(e) => persist(editDuesAt(i, { rule: e.target.value as DuesRule }))}
                    className="rounded-lg border border-input bg-background px-2 py-1 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
                    aria-label="Dues rule"
                  >
                    {DUES_RULES.filter((r) => !c.tier || r.value !== "inherit").map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  {c.dues.rule === "custom" && (
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        $
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={c.dues.amount || ""}
                        onChange={(e) =>
                          edit(editDuesAt(i, { amount: Number(e.target.value) || 0 }))
                        }
                        onBlur={() => persist(catsRef.current)}
                        className="font-money w-full rounded-lg border border-input bg-background py-1 pl-5 pr-2 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
                        aria-label="Custom dues amount"
                      />
                    </div>
                  )}
                </div>

                {/* Promote to a first-class tier (own card + own budget line) */}
                <label className="mt-2 flex cursor-pointer items-center gap-2 pl-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={c.tier === true}
                    onChange={() => toggleTier(i)}
                    className="h-3.5 w-3.5 cursor-pointer accent-[var(--primary)]"
                    aria-label="Make this a tier"
                  />
                  Make this a tier — its own roster card &amp; budget line, bills any
                  member
                </label>
                {c.tier && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                    <input
                      value={c.plural ?? ""}
                      onChange={(e) => edit(editAt(i, { plural: e.target.value }))}
                      onBlur={() => persist(catsRef.current)}
                      placeholder="Label, e.g. Associates"
                      className={`${inputCls} w-44`}
                      aria-label="Tier label"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      Collects
                      <span className="relative w-[4.5rem]">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={pctOf(c.collectionRate)}
                          onChange={(e) =>
                            edit(editAt(i, { collectionRate: clampPct(e.target.value) }))
                          }
                          onBlur={() => persist(catsRef.current)}
                          className="font-money w-full rounded-lg border border-input bg-background py-1 pl-2 pr-6 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
                          aria-label="Tier collection rate"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                          %
                        </span>
                      </span>
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>

          {cats.length < MAX_CUSTOM_CATEGORIES && (
            <button
              onClick={add}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              <Plus className="h-4 w-4" />
              Add category
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-4">
          <p className="hidden max-w-md text-xs text-muted-foreground sm:block">
            A plain category re-prices Brothers &amp; Pledges. Promote it to a tier
            to bill any member and give it its own budget line. Saves automatically.
          </p>
          <button
            onClick={onClose}
            className="ml-auto rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
