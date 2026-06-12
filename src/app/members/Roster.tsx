"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  addMember,
  updateMember,
  markMemberPaid,
  deleteMember,
  syncRosterToBudget,
} from "@/app/actions/members";
import { MemberRow, SettingsRow } from "@/lib/db";
import { fmtUSD } from "@/lib/forecast";
import { inputCls } from "@/components/AuthShell";

type Filter = "all" | "active" | "pledge" | "unpaid";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Actives" },
  { key: "pledge", label: "Pledges" },
  { key: "unpaid", label: "Unpaid" },
];

export default function Roster({
  members,
  settings,
}: {
  members: MemberRow[];
  settings: SettingsRow;
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
    <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-gray-500">
          {actives} actives · {pledges} pledges
        </p>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Your roster with contact info and dues status — the foundation for mass
        email and text reminders.
      </p>

      {/* Summary */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === f.key
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {copied && <span className="text-sm text-emerald-600">{copied}</span>}
        <button
          onClick={() => copy("emails")}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Copy emails
        </button>
        <button
          onClick={() => copy("phones")}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Copy phones
        </button>
        <button
          disabled
          title="Mass email and SMS dues reminders are coming soon"
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-400 cursor-not-allowed"
        >
          Send reminders · Soon
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Copy buttons follow the current filter — e.g. filter to{" "}
        <span className="font-medium">Unpaid</span>, then copy emails to paste
        into a dues-reminder message.
      </p>

      {/* Roster table */}
      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="hidden sm:grid grid-cols-[1.4fr_1.6fr_1.1fr_5.5rem_7rem_6.5rem] gap-3 px-5 py-2.5 border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400 font-medium">
          <span>Name</span>
          <span>Email</span>
          <span>Phone</span>
          <span>Status</span>
          <span className="text-right">Dues</span>
          <span />
        </div>
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            {members.length === 0
              ? "No members yet — add them below, or re-import a roster from a fresh account."
              : "No members match this filter."}
          </p>
        )}
        <div className="divide-y divide-gray-50">
          {filtered.map((m) => (
            <MemberLine key={m.id} member={m} dues={duesFor(m)} />
          ))}
        </div>
        <AddMemberLine />
      </section>
    </main>
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
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-xs uppercase tracking-wide text-gray-400 font-medium">{label}</p>
      <p
        className={`text-2xl font-semibold mt-1.5 ${
          tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : ""
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
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
  settings: SettingsRow;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-6">
      <p className="text-sm text-amber-900 flex-1 min-w-60">
        Your roster ({actives} actives, {pledges} pledges, {fmtUSD(collected)}{" "}
        collected) doesn&apos;t match the budget ({settings.active_members} actives,{" "}
        {settings.current_pledges} pledges, {fmtUSD(settings.dues_collected)}{" "}
        collected).
      </p>
      <button
        disabled={isPending}
        onClick={() => startTransition(() => syncRosterToBudget())}
        className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
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
        className="grid sm:grid-cols-[1.4fr_1.6fr_1.1fr_5.5rem_7rem_6.5rem] gap-2 px-5 py-3 bg-indigo-50/40 items-center"
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
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            name="amount_paid" type="number" min={0} step="0.01"
            defaultValue={member.amount_paid}
            title="Amount paid so far"
            className={`${inputCls} pl-6`}
          />
        </div>
        <div className="flex gap-1.5 justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {isPending ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="group grid sm:grid-cols-[1.4fr_1.6fr_1.1fr_5.5rem_7rem_6.5rem] gap-3 px-5 py-3 items-center hover:bg-gray-50/60">
      <button onClick={() => setEditing(true)} className="text-left text-sm font-medium truncate cursor-pointer" title="Click to edit">
        {member.name}
      </button>
      <span className="text-sm text-gray-600 truncate">
        {member.email ? (
          <a href={`mailto:${member.email}`} className="hover:text-indigo-600 hover:underline">
            {member.email}
          </a>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </span>
      <span className="text-sm text-gray-600 truncate">
        {member.phone || <span className="text-gray-300">—</span>}
      </span>
      <span
        className={`text-xs font-medium rounded-full px-2 py-1 text-center w-fit ${
          member.status === "active"
            ? "bg-emerald-50 text-emerald-700"
            : "bg-sky-50 text-sky-700"
        }`}
      >
        {member.status === "active" ? "Active" : "Pledge"}
      </span>
      <span className="text-sm text-right">
        {paidUp ? (
          <span className="text-emerald-600 font-medium">Paid ✓</span>
        ) : (
          <span className="text-red-600 font-medium" title={`${fmtUSD(member.amount_paid)} of ${fmtUSD(dues)} paid`}>
            owes {fmtUSD(balance)}
          </span>
        )}
      </span>
      <div className="flex gap-2 justify-end items-center">
        {!paidUp && (
          <button
            disabled={isPending}
            onClick={() => {
              const fd = new FormData();
              fd.set("id", String(member.id));
              fd.set("amount", String(dues));
              startTransition(() => markMemberPaid(fd));
            }}
            className="text-xs rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-1 font-medium hover:bg-emerald-100 disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity"
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
          className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
          title="Delete member"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
          </svg>
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
      className="grid sm:grid-cols-[1.4fr_1.6fr_1.1fr_5.5rem_7rem_6.5rem] gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50/60 items-center"
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
        className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
