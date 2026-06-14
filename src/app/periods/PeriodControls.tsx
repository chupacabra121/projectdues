"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  createPeriod,
  deletePeriod,
  renamePeriod,
  setActivePeriod,
} from "@/app/actions/periods";
import { inputCls, labelCls } from "@/components/AuthShell";

export function PeriodActions({
  id,
  name,
  isActive,
  canDelete,
}: {
  id: number;
  name: string;
  isActive: boolean;
  canDelete: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (renaming) {
    return (
      <form
        action={(fd) =>
          startTransition(async () => {
            await renamePeriod(fd);
            setRenaming(false);
          })
        }
        className="flex items-center gap-2"
      >
        <input type="hidden" name="id" value={id} />
        <input
          name="name"
          defaultValue={name}
          autoFocus
          className="w-40 rounded-lg border border-input bg-background px-2 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setRenaming(false)}
          className="rounded-full border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          ✕
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!isActive && (
        <button
          disabled={isPending}
          onClick={() => {
            const fd = new FormData();
            fd.set("id", String(id));
            startTransition(() => setActivePeriod(fd));
          }}
          className="rounded-full border border-border bg-background px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isPending ? "Switching…" : "Switch to"}
        </button>
      )}
      <button
        onClick={() => setRenaming(true)}
        className="text-muted-foreground/50 transition-colors hover:text-primary"
        title="Rename period"
      >
        <Pencil className="h-4 w-4" />
      </button>
      {canDelete && (
        <button
          disabled={isPending}
          onClick={() => {
            if (
              !window.confirm(
                `Delete "${name}" and everything in it — budget items, members, and caps? This cannot be undone.`
              )
            )
              return;
            const fd = new FormData();
            fd.set("id", String(id));
            startTransition(() => deletePeriod(fd));
          }}
          className="text-muted-foreground/50 transition-colors hover:text-destructive disabled:opacity-50"
          title="Delete period"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

const CARRY_OPTIONS = [
  {
    name: "carry_settings",
    label: "Dues & budget settings",
    hint: "Dues amounts, collection rate, scenarios, reserve target",
    default: true,
  },
  {
    name: "carry_roster",
    label: "Member roster",
    hint: "Names and contacts carry over; everyone starts unpaid",
    default: true,
  },
  {
    name: "promote_pledges",
    label: "Promote pledges to brothers",
    hint: "Last semester's pledge class initiates into the new roster",
    default: true,
  },
  {
    name: "carry_obligations",
    label: "Fixed obligations",
    hint: "Rent, insurance, national fees — monthly bills re-anchor to the new calendar",
    default: true,
  },
  {
    name: "carry_caps",
    label: "Category allocations",
    hint: "Spending caps per category",
    default: true,
  },
] as const;

export function CreatePeriodForm({
  defaultName,
  defaultStart,
  defaultEnd,
  hasSource,
}: {
  defaultName: string;
  defaultStart: string;
  defaultEnd: string;
  hasSource: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <form action={(fd) => startTransition(() => createPeriod(fd))} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Name</label>
          <input name="name" defaultValue={defaultName} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Starts</label>
          <input name="start" type="date" defaultValue={defaultStart} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Ends</label>
          <input name="end" type="date" defaultValue={defaultEnd} required className={inputCls} />
        </div>
      </div>

      {hasSource && (
        <div>
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Carry over from the active period
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {CARRY_OPTIONS.map((opt) => (
              <label
                key={opt.name}
                className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  name={opt.name}
                  defaultChecked={opt.default}
                  className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground/80">
            Starting balance and dues collected always reset — set the new
            starting balance on the Budget tab once you know it.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create period & switch to it"}
      </button>
    </form>
  );
}
