"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { BellRing, Trash2 } from "lucide-react";
import { addMember, updateMember, deleteMember } from "@/app/actions/members";
import { MemberRow } from "@/lib/db";
import { MemberStatus, MEMBER_STATUSES } from "@/lib/memberStatus";
import { inputCls } from "@/components/AuthShell";

type Filter = "all" | MemberStatus;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  ...MEMBER_STATUSES.map((s) => ({ key: s.value, label: s.plural })),
];

const STATUS_BADGE: Record<MemberStatus, string> = {
  active: "bg-primary/10 text-accent-foreground",
  pledge: "bg-secondary text-secondary-foreground",
  alumni: "bg-muted text-foreground",
  inactive: "bg-muted/60 text-muted-foreground",
};

const labelFor = (s: MemberStatus) =>
  MEMBER_STATUSES.find((x) => x.value === s)?.label ?? s;

const ROW_GRID = "sm:grid-cols-[1.5fr_1.8fr_1.2fr_6rem_3.5rem]";

export default function Roster({ members }: { members: MemberRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState("");

  const filtered = useMemo(
    () =>
      filter === "all" ? members : members.filter((m) => m.status === filter),
    [members, filter]
  );

  const counts = MEMBER_STATUSES.map((s) => ({
    ...s,
    n: members.filter((m) => m.status === s.value).length,
  }));

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
          Your member roster — names, contact details, and membership category.
          The foundation for mass email and text reminders.
        </p>
        <p className="whitespace-nowrap text-sm text-muted-foreground">
          {members.length} {members.length === 1 ? "member" : "members"}
        </p>
      </div>

      {/* Category counts — click a card to filter to it */}
      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {counts.map((c) => (
          <button
            key={c.value}
            onClick={() => setFilter((f) => (f === c.value ? "all" : c.value))}
            className={`rounded-2xl border p-5 text-left transition-colors ${
              filter === c.value
                ? "border-primary/50 bg-primary/5"
                : "border-border bg-card hover:border-primary/40"
            }`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {c.plural}
            </p>
            <p className="mt-1.5 text-2xl font-semibold text-foreground">{c.n}</p>
          </button>
        ))}
      </section>

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
        <Link
          href="/agents/dues-collection/email"
          title="Open Dunn's email composer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <BellRing className="h-3.5 w-3.5" />
          Send reminders
        </Link>
      </div>
      <p className="mb-4 text-xs text-muted-foreground/80">
        Copy buttons follow the current filter — e.g. filter to{" "}
        <span className="font-medium">Alumni</span>, then copy emails to paste
        into a newsletter.
      </p>

      {/* Roster table */}
      <section className="overflow-hidden rounded-[1.5rem] border border-border bg-card">
        <div className={`hidden gap-3 border-b border-border/60 px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid ${ROW_GRID}`}>
          <span>Name</span>
          <span>Email</span>
          <span>Phone</span>
          <span>Category</span>
          <span />
        </div>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground/70">
            {members.length === 0
              ? "No members yet — add them below."
              : "No members in this category."}
          </p>
        )}
        <div className="divide-y divide-border/40">
          {filtered.map((m) => (
            <MemberLine key={m.id} member={m} />
          ))}
        </div>
        <AddMemberLine />
      </section>
    </>
  );
}

function MemberLine({ member }: { member: MemberRow }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

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
          {MEMBER_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
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
        className={`w-fit rounded-full px-2 py-1 text-center text-xs font-medium ${STATUS_BADGE[member.status]}`}
      >
        {labelFor(member.status)}
      </span>
      <div className="flex items-center justify-end">
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
        {MEMBER_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "…" : "Add"}
      </button>
    </form>
  );
}
