"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { BellRing, RotateCcw, Trash2 } from "lucide-react";
import { addMember, updateMember, setMemberStatus } from "@/app/actions/members";
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
  trash: "bg-destructive/10 text-destructive",
};

const labelFor = (s: MemberStatus) =>
  MEMBER_STATUSES.find((x) => x.value === s)?.label ?? s;

// You can add a member as any category except the Trash bin.
const ADD_STATUSES = MEMBER_STATUSES.filter((s) => s.value !== "trash");

const ROW_GRID = "sm:grid-cols-[1.5fr_1.8fr_1.2fr_6rem_3.5rem]";
const DRAG_MIME = "text/plain";

export default function Roster({ members }: { members: MemberRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState("");
  const [dragOver, setDragOver] = useState<MemberStatus | null>(null);
  const [toast, setToast] = useState<{
    id: number;
    name: string;
    prevStatus: MemberStatus;
  } | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      filter === "all"
        ? members.filter((m) => m.status !== "trash")
        : members.filter((m) => m.status === filter),
    [members, filter]
  );

  const counts = MEMBER_STATUSES.map((s) => ({
    ...s,
    n: members.filter((m) => m.status === s.value).length,
  }));
  const rosterCount = members.filter((m) => m.status !== "trash").length;

  // Auto-dismiss the undo toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const moveStatus = (id: number, status: MemberStatus) => {
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("status", status);
    startTransition(() => setMemberStatus(fd));
  };

  const trashMember = (m: MemberRow) => {
    setToast({ id: m.id, name: m.name, prevStatus: m.status });
    moveStatus(m.id, "trash");
  };
  const restoreMember = (m: MemberRow) => moveStatus(m.id, "active");
  const undoTrash = () => {
    if (!toast) return;
    moveStatus(toast.id, toast.prevStatus);
    setToast(null);
  };

  const handleDrop = (status: MemberStatus, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData(DRAG_MIME));
    const m = members.find((x) => x.id === id);
    if (!m || m.status === status) return;
    if (status === "trash") {
      setToast({ id: m.id, name: m.name, prevStatus: m.status });
    }
    moveStatus(id, status);
  };

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
          Drag anyone onto a category to move them.
        </p>
        <p className="whitespace-nowrap text-sm text-muted-foreground">
          {rosterCount} {rosterCount === 1 ? "member" : "members"}
        </p>
      </div>

      {/* Category cards — click to filter, or drop a member to move them */}
      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {counts.map((c) => {
          const isTrash = c.value === "trash";
          const over = dragOver === c.value;
          return (
            <button
              key={c.value}
              onClick={() => setFilter((f) => (f === c.value ? "all" : c.value))}
              onDragEnter={(e) => e.preventDefault()}
              onDragOver={(e) => {
                // Allowing the drop AND matching the row's effectAllowed="move"
                // is what makes the browser actually fire onDrop here.
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOver !== c.value) setDragOver(c.value);
              }}
              onDragLeave={() => setDragOver((d) => (d === c.value ? null : d))}
              onDrop={(e) => handleDrop(c.value, e)}
              className={`rounded-2xl p-5 text-left transition-colors ${
                over
                  ? "border border-primary bg-primary/10 ring-2 ring-primary/30"
                  : filter === c.value
                    ? "border border-primary/50 bg-primary/5"
                    : `glass hover:border-primary/40 ${
                        isTrash ? "border-dashed" : ""
                      }`
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {c.plural}
              </p>
              <p
                className={`mt-1.5 text-2xl font-semibold ${
                  isTrash ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {c.n}
              </p>
            </button>
          );
        })}
      </section>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-full border border-border bg-card p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f.key
                  ? "bg-primary/15 text-accent-foreground ring-1 ring-primary/30"
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
          href="/email"
          title="Open Dunn's email composer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <BellRing className="h-3.5 w-3.5" />
          Send reminders
        </Link>
      </div>
      <p className="mb-4 text-xs text-muted-foreground/80">
        Drag a member onto a category to move them. Deleting sends them to{" "}
        <span className="font-medium">Trash</span> — undo from the popup, or drag
        them back out.
      </p>

      {/* Roster table */}
      <section className="glass overflow-hidden rounded-[1.5rem]">
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
              : filter === "trash"
                ? "Trash is empty."
                : "No members in this category."}
          </p>
        )}
        <div className="divide-y divide-border/40">
          {filtered.map((m) => (
            <MemberLine
              key={m.id}
              member={m}
              onTrash={trashMember}
              onRestore={restoreMember}
            />
          ))}
        </div>
        <AddMemberLine />
      </section>

      {/* Undo toast */}
      {toast && (
        <div className="glass-elevated fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl">
          <span className="text-sm text-foreground">
            Moved <span className="font-medium">{toast.name}</span> to Trash
          </span>
          <button
            onClick={undoTrash}
            className="rounded-full bg-foreground px-3 py-1 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Undo
          </button>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}

function MemberLine({
  member,
  onTrash,
  onRestore,
}: {
  member: MemberRow;
  onTrash: (m: MemberRow) => void;
  onRestore: (m: MemberRow) => void;
}) {
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

  // The whole row opens the editor (click name/email/phone/category) and is
  // draggable onto a category card to re-categorize without opening it.
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, String(member.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setEditing(true);
        }
      }}
      title="Click to edit · drag to a category to move"
      className={`group grid cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 ${ROW_GRID}`}
    >
      <span className="truncate text-sm font-medium text-foreground">
        {member.name}
      </span>
      <span className="truncate text-sm text-muted-foreground">
        {member.email || <span className="text-muted-foreground/40">—</span>}
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
        {member.status === "trash" ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRestore(member);
            }}
            className="text-muted-foreground/50 transition-colors hover:text-primary"
            title="Restore to Active"
            aria-label="Restore member"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTrash(member);
            }}
            className="text-muted-foreground/40 transition-colors hover:text-destructive"
            title="Move to Trash"
            aria-label="Move to Trash"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
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
        {ADD_STATUSES.map((s) => (
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
