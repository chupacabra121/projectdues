"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { BellRing, Trash2 } from "lucide-react";
import {
  addMember,
  updateMember,
  markMemberPaid,
  deleteMember,
  syncRosterToBudget,
} from "@/app/actions/members";
import { MemberRow, PeriodRow } from "@/lib/db";
import { fmtUSD } from "@/lib/forecast";
import { inputCls } from "@/components/AuthShell";

type Filter = "all" | "active" | "pledge" | "unpaid";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Actives" },
  { key: "pledge", label: "Pledges" },
  { key: "unpaid", label: "Unpaid" },
];

const ROW_GRID = "sm:grid-cols-[1.4fr_1.6fr_1.1fr_5.5rem_7rem_6.5rem]";

export default function Roster({
  members,
  settings,
}: {
  members: MemberRow[];
  settings: PeriodRow;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState("");

  const duesFor = (m: MemberRow) =>
    m.status === "active" ? settings.active_dues : settings.pledge_dues;
  const isUnpaid = (m: MemberRow) => m.amount_paid < duesFor(m);

  const filtered = useMemo(() => {
    switch (filter) {
      case "active":
        return members.filter((m) => m.status === "active");
      case "pledge":
        return members.filter((m) => m.status === "pledge");
      case "unpaid":
        return members.filter(isUnpaid);
      default:
        return members;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, filter, settings.active_dues, settings.pledge_dues]);

  const actives = members.filter((m) => m.status === "active").length;
  const pledges = members.filter((m) => m.status === "pledge").length;
  const totalBilled = members.reduce((s, m) => s + duesFor(m), 0);
  const totalCollected = members.reduce((s, m) => s + m.amount_paid, 0);
  const outstanding = Math.max(0, totalBilled - totalCollected);
  const unpaidCount = members.filter(isUnpaid).length;

  const rosterDiffersFromBudget =
    members.length > 0 &&
    (settings.active_members !== actives ||
      settings.current_pledges !== pledges ||
      Math.round(settings.dues_collected) !== Math.round(totalCollected));

  async function copy(kind: "emails" | "phones") {
    const values = filtered
      .map((m) => (kind === "emails" ? m.email : m.phone))
      .filter(Boolean);
    const text = values.join(", ");
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can be blocked (permissions, iframes) — fall back to
      // the legacy execCommand path.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    }
    setCopied(
      ok ? `${values.length} ${kind} copied` : "Couldn't copy — check browser permissions"
    );
    setTimeout(() => setCopied(""), 2500);
  }

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Member information with contact details and dues status — the
          foundation for mass email and text reminders.
        </p>
        <p className="whitespace-nowrap text-sm text-muted-foreground">
          {actives} actives · {pledges} pledges
        </p>
      </div>

      {/* Summary */}
      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Dues Billed" value={fmtUSD(totalBilled)}
          sub={`${members.length} members`} />
        <SummaryCard label="Collected" value={fmtUSD(totalCollected)}
          sub={totalBilled > 0 ? `${Math.round((totalCollected / totalBilled) * 100)}% of billed` : "—"} tone="good" />
        <SummaryCard label="Outstanding" value={fmtUSD(outstanding)}
          sub={`${unpaidCount} member${unpaidCount === 1 ? "" : "s"} owe money`}
          tone={outstanding > 0 ? "bad" : "good"} />
        <SummaryCard label="Per-Member Dues" value={`${fmtUSD(settings.active_dues)} / ${fmtUSD(settings.pledge_dues)}`}
          sub="active / pledge (set on Budget tab)" />
      </section>

      {/* Sync banner */}
      {rosterDiffersFromBudget && (
        <SyncBanner
          actives={actives}
          pledges={pledges}
          collected={totalCollected}
          settings={settings}
        />
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-border bg-card p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {copied && <span className="text-sm text-primary">{copied}</span>}
        <button
          onClick={() => copy("emails")}
          className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Copy emails
        </button>
        <button
          onClick={() => copy("phones")}
          className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Copy phones
        </button>
        <button
          disabled
          title="The Dues Collection Agent will send mass email and SMS reminders — coming soon"
          className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-border bg-muted px-3.5 py-1.5 text-sm font-medium text-muted-foreground"
        >
          <BellRing className="h-3.5 w-3.5" />
          Send reminders · Soon
        </button>
      </div>
      <p className="mb-4 text-xs text-muted-foreground/80">
        Copy buttons follow the current filter — e.g. filter to{" "}
        <span className="font-medium">Unpaid</span>, then copy emails to paste
        into a dues-reminder message.
      </p>

      {/* Roster table */}
      <section className="overflow-hidden rounded-[1.5rem] border border-border bg-card">
        <div className={`hidden gap-3 border-b border-border/60 px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid ${ROW_GRID}`}>
          <span>Name</span>
          <span>Email</span>
          <span>Phone</span>
          <span>Status</span>
          <span className="text-right">Dues</span>
          <span />
        </div>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground/70">
            {members.length === 0
              ? "No members yet — add them below."
              : "No members match this filter."}
          </p>
        )}
        <div className="divide-y divide-border/40">
          {filtered.map((m) => (
            <MemberLine key={m.id} member={m} dues={duesFor(m)} />
          ))}
        </div>
        <AddMemberLine />
      </section>
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-semibold ${
          tone === "good"
            ? "text-primary"
            : tone === "bad"
              ? "text-destructive"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function SyncBanner({
  actives,
  pledges,
  collected,
  settings,
}: {
  actives: number;
  pledges: number;
  collected: number;
  settings: PeriodRow;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <p className="min-w-60 flex-1 text-sm leading-6 text-foreground/80">
        Your roster ({actives} actives, {pledges} pledges, {fmtUSD(collected)}{" "}
        collected) doesn&apos;t match the budget ({settings.active_members} actives,{" "}
        {settings.current_pledges} pledges, {fmtUSD(settings.dues_collected)}{" "}
        collected).
      </p>
      <button
        disabled={isPending}
        onClick={() => startTransition(() => syncRosterToBudget())}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Syncing…" : "Use roster numbers in budget"}
      </button>
    </div>
  );
}

function MemberLine({ member, dues }: { member: MemberRow; dues: number }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const balance = dues - member.amount_paid;
  const paidUp = balance <= 0;

  if (editing) {
    return (
      <form
        action={(fd) =>
          startTransition(async () => {
            await updateMember(fd);
            setEditing(false);
          })
        }
        className={`grid items-center gap-2 bg-accent/30 px-5 py-3 ${ROW_GRID}`}
      >
        <input type="hidden" name="id" value={member.id} />
        <input name="name" defaultValue={member.name} required className={inputCls} />
        <input name="email" type="email" defaultValue={member.email} placeholder="email" className={inputCls} />
        <input name="phone" defaultValue={member.phone} placeholder="phone" className={inputCls} />
        <select name="status" defaultValue={member.status} className={inputCls}>
          <option value="active">Active</option>
          <option value="pledge">Pledge</option>
        </select>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <input
            name="amount_paid" type="number" min={0} step="0.01"
            defaultValue={member.amount_paid}
            title="Amount paid so far"
            className={`${inputCls} pl-6`}
          />
        </div>
        <div className="flex justify-end gap-1.5">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-full border border-border px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            ✕
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`group grid items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 ${ROW_GRID}`}>
      <button
        onClick={() => setEditing(true)}
        className="cursor-pointer truncate text-left text-sm font-medium text-foreground"
        title="Click to edit"
      >
        {member.name}
      </button>
      <span className="truncate text-sm text-muted-foreground">
        {member.email ? (
          <a href={`mailto:${member.email}`} className="transition-colors hover:text-primary hover:underline">
            {member.email}
          </a>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </span>
      <span className="truncate text-sm text-muted-foreground">
        {member.phone || <span className="text-muted-foreground/40">—</span>}
      </span>
      <span
        className={`w-fit rounded-full px-2 py-1 text-center text-xs font-medium ${
          member.status === "active"
            ? "bg-primary/10 text-accent-foreground"
            : "bg-secondary text-secondary-foreground"
        }`}
      >
        {member.status === "active" ? "Active" : "Pledge"}
      </span>
      <span className="text-right text-sm">
        {paidUp ? (
          <span className="font-medium text-primary">Paid ✓</span>
        ) : (
          <span
            className="font-medium text-destructive"
            title={`${fmtUSD(member.amount_paid)} of ${fmtUSD(dues)} paid`}
          >
            owes {fmtUSD(balance)}
          </span>
        )}
      </span>
      <div className="flex items-center justify-end gap-2">
        {!paidUp && (
          <button
            disabled={isPending}
            onClick={() => {
              const fd = new FormData();
              fd.set("id", String(member.id));
              fd.set("amount", String(dues));
              startTransition(() => markMemberPaid(fd));
            }}
            className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-accent-foreground opacity-0 transition-opacity hover:bg-primary/20 disabled:opacity-50 group-hover:opacity-100"
            title="Mark full dues as paid"
          >
            Mark paid
          </button>
        )}
        <button
          disabled={isPending}
          onClick={() => {
            const fd = new FormData();
            fd.set("id", String(member.id));
            startTransition(() => deleteMember(fd));
          }}
          className="text-muted-foreground/40 transition-colors hover:text-destructive disabled:opacity-50"
          title="Delete member"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function AddMemberLine() {
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          await addMember(fd);
          formRef.current?.reset();
          formRef.current?.querySelector<HTMLInputElement>("input[name='name']")?.focus();
        })
      }
      className={`grid items-center gap-2 border-t border-border/60 bg-muted/40 px-5 py-3 ${ROW_GRID}`}
    >
      <input name="name" required placeholder="Add member — name" className={inputCls} />
      <input name="email" type="email" placeholder="email (optional)" className={inputCls} />
      <input name="phone" placeholder="phone (optional)" className={inputCls} />
      <select name="status" defaultValue="active" className={inputCls}>
        <option value="active">Active</option>
        <option value="pledge">Pledge</option>
      </select>
      <span />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
