"use client";

import { useRef, useState, useTransition } from "react";
import {
  addBudgetItem,
  deleteBudgetItem,
  updateBudgetItemCategory,
} from "@/app/actions/budget";
import { EVENT_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/categorize";
import { inputCls, labelCls } from "@/components/AuthShell";

export function AddItemForm({ type }: { type: "fixed_expense" | "planned_event" }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const isEvent = type === "planned_event";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
      >
        + Add {isEvent ? "Event" : "Obligation"}
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
      <div>
        <label className={labelCls}>{isEvent ? "Event Name" : "Name"}</label>
        <input
          name="name"
          required
          className={inputCls}
          placeholder={isEvent ? "Formal" : "National Fees"}
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
              className={`${inputCls} pl-7`} placeholder={isEvent ? "8000" : "4500"}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Date</label>
          <input name="date" type="date" className={inputCls} />
        </div>
      </div>
      {!isEvent && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Frequency</label>
            <select name="frequency" className={inputCls} defaultValue="one_time">
              <option value="one_time">One-time</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <select name="category" className={inputCls} defaultValue="auto">
              <option value="auto">Auto-detect</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      {isEvent && (
        <>
          <div>
            <label className={labelCls}>Expected Attendance (optional)</label>
            <input name="attendance" type="number" min={0} className={inputCls} placeholder="120" />
          </div>
          <div>
            <label className={labelCls}>Notes (optional)</label>
            <input name="notes" className={inputCls} placeholder="Venue deposit due 30 days out" />
          </div>
        </>
      )}
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

export function CategorySelect({
  id,
  category,
  type,
}: {
  id: number;
  category: string;
  type: "fixed_expense" | "planned_event";
}) {
  const [isPending, startTransition] = useTransition();
  const categories =
    type === "planned_event" ? EVENT_CATEGORIES : EXPENSE_CATEGORIES;
  const options = categories.includes(category as never)
    ? categories
    : [category, ...categories];

  return (
    <select
      defaultValue={category}
      disabled={isPending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("id", String(id));
        fd.set("category", e.target.value);
        startTransition(() => updateBudgetItemCategory(fd));
      }}
      className="text-xs rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-gray-600 hover:border-gray-400 cursor-pointer disabled:opacity-50"
    >
      {options.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
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
