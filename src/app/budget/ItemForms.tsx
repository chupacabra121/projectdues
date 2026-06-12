"use client";

import { useRef, useState, useTransition } from "react";
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
} from "@/lib/forecast";
import { inputCls, labelCls } from "@/components/AuthShell";

export type ItemType = "fixed_expense" | "planned_event" | "other_income";

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

function ItemFields({
  type,
  item,
}: {
  type: ItemType;
  item?: BudgetItemRow;
}) {
  const meta = TYPE_META[type];
  const isEvent = type === "planned_event";
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{isEvent ? "Expected Cost" : "Amount"}</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              name="amount" type="number" min={0} step="0.01" required
              defaultValue={item?.amount}
              className={`${inputCls} pl-7`} placeholder={meta.amountPlaceholder}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input name="date" type="date" defaultValue={item?.date ?? ""} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {!isEvent && (
          <div>
            <label className={labelCls}>Frequency</label>
            <select name="frequency" className={inputCls} defaultValue={item?.frequency ?? "one_time"}>
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

export function AddItemForm({ type }: { type: ItemType }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
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
      className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3"
    >
      <input type="hidden" name="type" value={type} />
      <ItemFields type={type} />
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-indigo-600 text-white py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
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
  const [isPending, startTransition] = useTransition();
  const n = occurrences(item, settings);

  if (editing) {
    return (
      <form
        action={(fd) =>
          startTransition(async () => {
            await updateBudgetItem(fd);
            setEditing(false);
          })
        }
        className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3"
      >
        <input type="hidden" name="type" value={item.type} />
        <input type="hidden" name="id" value={item.id} />
        <ItemFields type={item.type} item={item} />
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 rounded-lg bg-indigo-600 text-white py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
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

  return (
    <div className="group flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3 hover:border-gray-200">
      <button
        onClick={() => setEditing(true)}
        className="min-w-0 flex-1 text-left cursor-pointer"
        title="Click to edit"
      >
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{item.name}</p>
          <span className="text-xs rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 shrink-0">
            {item.category}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {fmtDate(item.date)}
          {item.frequency === "monthly" && ` · monthly ×${n}`}
          {item.frequency === "yearly" && " · yearly"}
          {item.attendance ? ` · ~${item.attendance} attending` : ""}
          {costPerPerson ? ` (${fmtUSD(costPerPerson)}/person)` : ""}
          {item.notes ? ` · ${item.notes}` : ""}
        </p>
      </button>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className="text-sm font-semibold">{fmtUSD(itemSemesterCost(item, settings))}</p>
          {n > 1 && <p className="text-xs text-gray-400">{fmtUSD(item.amount)}/mo</p>}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-gray-300 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100"
          title="Edit"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </button>
        <DeleteButton id={item.id} />
      </div>
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
      className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
      title="Delete"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
      </svg>
    </button>
  );
}
