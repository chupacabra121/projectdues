"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  addBudgetItem,
  deleteBudgetItem,
  updateBudgetItem,
} from "@/app/actions/budget";
import {
  EVENT_CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from "@/lib/categorize";
import { BudgetItemRow } from "@/lib/db";
import {
  ForecastSettings,
  fmtUSD,
  fmtDate,
  itemSemesterCost,
  occurrences,
  costBasisLabel,
  variableHeadcount,
} from "@/lib/forecast";
import { inputCls, labelCls } from "@/components/AuthShell";
import DatePicker from "@/components/DatePicker";
import { useClickOutsideSave } from "@/lib/useClickOutsideSave";
import BreakdownEditor from "./BreakdownEditor";

const num = (s: string) => {
  const n = parseFloat(s);
  return isNaN(n) || n < 0 ? 0 : n;
};

export type ItemType =
  | "fixed_expense"
  | "planned_event"
  | "other_income"
  | "variable_expense";

const TYPE_META: Record<
  ItemType,
  { noun: string; namePlaceholder: string; amountPlaceholder: string; categories: readonly string[] }
> = {
  fixed_expense: {
    noun: "Obligation",
    namePlaceholder: "National Fees",
    amountPlaceholder: "4500",
    categories: EXPENSE_CATEGORIES,
  },
  variable_expense: {
    noun: "Per-member cost",
    namePlaceholder: "Insurance",
    amountPlaceholder: "50",
    categories: EXPENSE_CATEGORIES,
  },
  planned_event: {
    noun: "Event",
    namePlaceholder: "Formal",
    amountPlaceholder: "8000",
    categories: EVENT_CATEGORIES,
  },
  other_income: {
    noun: "Income",
    namePlaceholder: "Spring Fundraiser",
    amountPlaceholder: "1500",
    categories: INCOME_CATEGORIES,
  },
};

function ItemFields({ type, item }: { type: ItemType; item?: BudgetItemRow }) {
  const meta = TYPE_META[type];
  const isEvent = type === "planned_event";
  const isVariable = type === "variable_expense";

  // Amount and frequency are controlled so the deposit/balance split can show a
  // live balance and only offer itself on one-time outflows.
  const [amount, setAmount] = useState(
    item?.amount != null ? String(item.amount) : ""
  );
  const [frequency, setFrequency] = useState<string>(item?.frequency ?? "one_time");
  const existingSplit =
    item?.schedule && item.schedule.length >= 2 ? item.schedule : null;
  const [splitOn, setSplitOn] = useState(!!existingSplit);
  const [deposit, setDeposit] = useState(
    existingSplit ? String(existingSplit[0].amount) : ""
  );
  const canSplit = isEvent || (type === "fixed_expense" && frequency !== "monthly");
  const showSplit = canSplit && splitOn;
  const total = num(amount);
  const balanceNum = Math.max(0, total - Math.min(total, num(deposit)));

  return (
    <>
      <div>
        <label className={labelCls}>{isEvent ? "Event Name" : "Name"}</label>
        <input
          name="name"
          required
          defaultValue={item?.name}
          className={inputCls}
          placeholder={meta.namePlaceholder}
          autoFocus
        />
      </div>
      <div className={`grid gap-3 ${showSplit ? "grid-cols-1" : "grid-cols-2"}`}>
        <div>
          <label className={labelCls}>
            {isEvent ? "Expected Cost" : isVariable ? "Cost per person" : "Amount"}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <input
              name="amount" type="number" min={0} step="0.01" required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputCls} pl-7`} placeholder={meta.amountPlaceholder}
            />
          </div>
        </div>
        {!showSplit &&
          (isVariable ? (
            <div>
              <label className={labelCls}>Per</label>
              <select name="cost_basis" className={inputCls} defaultValue={item?.cost_basis ?? "brother"}>
                <option value="brother">Brother</option>
                <option value="pledge">Pledge</option>
                <option value="member">Everyone</option>
              </select>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Date</label>
              <DatePicker name="date" defaultValue={item?.date ?? ""} />
            </div>
          ))}
      </div>

      {canSplit && (
        <PaymentSplit
          on={splitOn}
          setOn={setSplitOn}
          deposit={deposit}
          setDeposit={setDeposit}
          balance={balanceNum}
          existing={existingSplit}
          fallbackDate={item?.date ?? ""}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        {!isEvent && !isVariable && (
          <div>
            <label className={labelCls}>Frequency</label>
            <select
              name="frequency"
              className={inputCls}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              <option value="one_time">One-time</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
        )}
        <div>
          <label className={labelCls}>Category</label>
          <select name="category" className={inputCls} defaultValue={item?.category ?? "auto"}>
            {!item && <option value="auto">Auto-detect</option>}
            {meta.categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            {item && !meta.categories.includes(item.category) && (
              <option value={item.category}>{item.category}</option>
            )}
          </select>
        </div>
        {isEvent && (
          <div>
            <label className={labelCls}>Expected Attendance</label>
            <input
              name="attendance" type="number" min={0}
              defaultValue={item?.attendance ?? ""}
              className={inputCls} placeholder="120"
            />
          </div>
        )}
        {isVariable && (
          <div>
            <label className={labelCls}>Date (optional)</label>
            <DatePicker
              name="date"
              defaultValue={item?.date ?? ""}
              placeholder="When it's billed"
            />
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>Notes (optional)</label>
        <input
          name="notes" defaultValue={item?.notes}
          className={inputCls} placeholder="Venue deposit due 30 days out"
        />
      </div>
    </>
  );
}

/**
 * Deposit + balance split for a lumpy outflow (events / one-time fixed bills).
 * The balance is the total minus the deposit; each part submits its own date so
 * the server reconstructs a two-payment schedule. Collapsed by default.
 */
function PaymentSplit({
  on,
  setOn,
  deposit,
  setDeposit,
  balance,
  existing,
  fallbackDate,
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  deposit: string;
  setDeposit: (v: string) => void;
  balance: number;
  existing: { amount: number; date: string }[] | null;
  fallbackDate: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
        Split into payments
        <span className="text-xs font-normal text-muted-foreground">deposit + balance</span>
      </label>
      {on && (
        <div className="mt-3 space-y-3">
          <input type="hidden" name="splitOn" value="1" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Deposit</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <input
                  name="depositAmount" type="number" min={0} step="0.01"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                  className={`${inputCls} pl-7`} placeholder="2000"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Deposit date</label>
              <DatePicker
                name="depositDate"
                defaultValue={existing ? existing[0].date : fallbackDate}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Balance</label>
              <div className={`${inputCls} flex items-center font-money`}>{fmtUSD(balance)}</div>
            </div>
            <div>
              <label className={labelCls}>Balance due</label>
              <DatePicker
                name="balanceDate"
                defaultValue={existing ? existing[existing.length - 1].date : ""}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Each part hits the cash timeline on its own date.
          </p>
        </div>
      )}
    </div>
  );
}

export function AddItemForm({ type }: { type: ItemType }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        + Add {TYPE_META[type].noun}
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          await addBudgetItem(fd);
          formRef.current?.reset();
          setOpen(false);
        })
      }
      className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4"
    >
      <input type="hidden" name="type" value={type} />
      <ItemFields type={type} />
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ItemRow({
  item,
  settings,
}: {
  item: BudgetItemRow;
  settings: ForecastSettings;
}) {
  const [editing, setEditing] = useState(false);
  // Progressive disclosure: the figure itself opens its build-up.
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const n = occurrences(item, settings);
  // Clicking outside the open editor saves it (same as the Save button).
  useClickOutsideSave(formRef, editing);

  if (editing) {
    return (
      <form
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            await updateBudgetItem(fd);
            setEditing(false);
          })
        }
        className="space-y-3 rounded-2xl border border-primary/30 bg-accent/40 p-4"
      >
        <input type="hidden" name="type" value={item.type} />
        <input type="hidden" name="id" value={item.id} />
        <ItemFields type={item.type} item={item} />
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  const costPerPerson =
    item.type === "planned_event" && item.attendance
      ? item.amount / item.attendance
      : null;
  const isVariable = item.type === "variable_expense";
  const head = isVariable
    ? variableHeadcount(item.cost_basis, settings, settings.pledges_expected)
    : 0;

  return (
    <div>
      <div className="group flex items-center justify-between gap-3 rounded-2xl border border-border/60 px-4 py-3 transition-colors hover:border-border hover:bg-muted/30">
      <button
        onClick={() => setEditing(true)}
        className="min-w-0 flex-1 cursor-pointer text-left"
        title="Click to edit"
      >
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {item.category}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isVariable ? (
            `${fmtUSD(item.amount)} per ${costBasisLabel(item.cost_basis)} · ×${head}${
              item.date ? ` · ${fmtDate(item.date)}` : ""
            }`
          ) : (
            <>
              {item.schedule && item.schedule.length >= 2
                ? `${fmtUSD(item.schedule[0].amount)} ${fmtDate(item.schedule[0].date)} → ${fmtUSD(
                    item.schedule[item.schedule.length - 1].amount
                  )} ${fmtDate(item.schedule[item.schedule.length - 1].date)}`
                : fmtDate(item.date)}
              {item.frequency === "monthly" && ` · monthly ×${n}`}
              {item.frequency === "yearly" && " · yearly"}
              {item.attendance ? ` · ~${item.attendance} attending` : ""}
              {costPerPerson ? ` (${fmtUSD(costPerPerson)}/person)` : ""}
            </>
          )}
          {item.notes ? ` · ${item.notes}` : ""}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          className="cursor-pointer text-right"
          title={
            item.breakdown
              ? "Show what this figure is made of"
              : "Break this figure into units × rate"
          }
        >
          <p
            className={`font-money text-sm font-semibold text-foreground ${
              item.breakdown ? "underline decoration-dotted underline-offset-4" : ""
            }`}
          >
            {fmtUSD(itemSemesterCost(item, settings))}
          </p>
          {n > 1 && (
            <p className="font-money text-xs text-muted-foreground">{fmtUSD(item.amount)}/mo</p>
          )}
          {item.breakdown && (
            <p className="text-[0.65rem] text-muted-foreground">
              {item.breakdown.length} line{item.breakdown.length === 1 ? "" : "s"}
            </p>
          )}
        </button>
        <button
          onClick={() => setEditing(true)}
          className="text-muted-foreground/40 opacity-0 transition-all hover:text-primary group-hover:opacity-100"
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <DeleteButton id={item.id} />
      </div>
      </div>
      {showBreakdown && (
        <BreakdownEditor
          itemId={item.id}
          initial={item.breakdown}
          fallbackAmount={item.amount}
          onClose={() => setShowBreakdown(false)}
        />
      )}
    </div>
  );
}

export function DeleteButton({ id }: { id: number }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      disabled={isPending}
      onClick={() => {
        const fd = new FormData();
        fd.set("id", String(id));
        startTransition(() => deleteBudgetItem(fd));
      }}
      className="text-muted-foreground/40 transition-colors hover:text-destructive disabled:opacity-50"
      title="Delete"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
