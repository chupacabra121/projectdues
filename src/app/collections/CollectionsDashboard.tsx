"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareText,
  PhoneCall,
} from "lucide-react";
import {
  logMemberContact,
  logMembersContact,
  setMemberCollectionStage,
  setMembersCollectionStage,
} from "@/app/actions/collections";
import type { MemberRow, PeriodRow } from "@/lib/db";
import { fmtUSD } from "@/lib/forecast";
import { memberEffectiveDues } from "@/lib/memberDues";
import {
  COLLECTION_STAGES,
  CONTACT_CHANNELS,
  CollectionStage,
  ContactChannel,
  collectionStageLabel,
} from "@/lib/collectionStages";

type CollectionMember = MemberRow & {
  effectiveStage: CollectionStage;
  amountDue: number;
  daysSinceContact: number | null;
};

const stageTone: Record<CollectionStage, string> = {
  not_contacted: "bg-muted text-muted-foreground",
  reminder_sent: "bg-primary/10 text-accent-foreground",
  follow_up: "bg-secondary text-secondary-foreground",
  overdue: "bg-destructive/10 text-destructive",
  payment_plan: "bg-muted text-foreground",
  paid: "bg-primary/10 text-accent-foreground",
};

export default function CollectionsDashboard({
  members,
  period,
}: {
  members: MemberRow[];
  period: PeriodRow;
}) {
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const billable = members
    .filter((member) => member.status === "brother" || member.status === "pledge")
    .map((member) => toCollectionMember(member, period));
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const paid = billable.filter((member) => member.effectiveStage === "paid");
  const contacted = billable.filter((member) => member.contact_count > 0);
  const neverContacted = billable.filter((member) => member.contact_count === 0);
  const stale = billable.filter(
    (member) =>
      member.effectiveStage !== "paid" &&
      member.daysSinceContact != null &&
      member.daysSinceContact >= 7
  );
  const open = billable.filter((member) => member.effectiveStage !== "paid");
  const openAmount = open.reduce((sum, member) => sum + member.amountDue, 0);
  const totalAmount = billable.reduce((sum, member) => sum + member.amountDue, 0);
  const stageCounts = COLLECTION_STAGES.map((stage) => ({
    ...stage,
    count: billable.filter((member) => member.effectiveStage === stage.value).length,
  }));
  const lastContacted = contacted
    .slice()
    .sort(
      (a, b) =>
        Date.parse(toIso(b.last_contacted_at)) -
        Date.parse(toIso(a.last_contacted_at))
    )
    .slice(0, 5);

  function changeStage(memberId: number, stage: CollectionStage) {
    const fd = new FormData();
    fd.set("id", String(memberId));
    fd.set("stage", stage);
    startTransition(() => setMemberCollectionStage(fd));
  }

  function logContact(
    memberId: number,
    channel: ContactChannel,
    stage: CollectionStage
  ) {
    const fd = new FormData();
    fd.set("id", String(memberId));
    fd.set("channel", channel);
    fd.set("stage", stage);
    startTransition(() => logMemberContact(fd));
  }

  function toggleMember(memberId: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function selectMembers(ids: number[]) {
    setSelected(new Set(ids));
  }

  function batchStage(stage: CollectionStage) {
    if (selectedIds.length === 0) return;
    const fd = new FormData();
    fd.set("ids", selectedIds.join(","));
    fd.set("stage", stage);
    startTransition(() => setMembersCollectionStage(fd));
    setSelected(new Set());
  }

  function batchLog(channel: ContactChannel) {
    if (selectedIds.length === 0) return;
    const fd = new FormData();
    fd.set("ids", selectedIds.join(","));
    fd.set("channel", channel);
    fd.set("stage", "reminder_sent");
    startTransition(() => logMembersContact(fd));
    setSelected(new Set());
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Open dues" value={fmtUSD(openAmount)} sub={`${open.length} unpaid`} />
        <Metric label="Contacted" value={String(contacted.length)} sub={`${neverContacted.length} never contacted`} />
        <Metric label="Stale follow-ups" value={String(stale.length)} sub="7+ days since contact" tone={stale.length ? "bad" : "good"} />
        <Metric label="Collected / expected" value={`${paid.length}/${billable.length}`} sub={`${fmtUSD(totalAmount - openAmount)} marked paid`} tone="good" />
      </div>

      <section className="glass rounded-[1.5rem] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Collection stages
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              Where everyone stands
            </h2>
          </div>
          <CheckCircle2 className="h-5 w-5 text-primary" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {stageCounts.map((stage) => (
            <div
              key={stage.value}
              className="rounded-xl border border-border bg-background p-3"
            >
              <p className="text-xs font-semibold text-muted-foreground">
                {stage.shortLabel}
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {stage.count}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="glass overflow-hidden rounded-[1.5rem]">
          <div className="border-b border-border/60 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Member queue
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              Stage and contact tracking
            </h2>
          </div>
          <div className="border-b border-border/60 bg-muted/30 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {selectedIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => selectMembers(open.map((member) => member.id))}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Select unpaid
              </button>
              <button
                type="button"
                onClick={() => selectMembers(stale.map((member) => member.id))}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
              >
                Select stale
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                disabled={selectedIds.length === 0}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                Clear
              </button>
              <span className="hidden flex-1 lg:block" />
              <button
                type="button"
                onClick={() => batchLog("email")}
                disabled={selectedIds.length === 0}
                className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Log email
              </button>
              <button
                type="button"
                onClick={() => batchLog("sms")}
                disabled={selectedIds.length === 0}
                className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Log SMS
              </button>
              <select
                defaultValue=""
                disabled={selectedIds.length === 0}
                onChange={(event) => {
                  if (!event.target.value) return;
                  batchStage(event.target.value as CollectionStage);
                  event.currentTarget.value = "";
                }}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
              >
                <option value="">Move stage...</option>
                {COLLECTION_STAGES.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {billable.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted-foreground/70">
              No brothers or pledges to collect from.
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {billable.map((member) => (
                <div
                  key={member.id}
                  className="grid gap-3 px-5 py-4 lg:grid-cols-[1.75rem_1fr_8.5rem_8.5rem_11rem]"
                >
                  <label className="flex items-start pt-1">
                    <input
                      type="checkbox"
                      checked={selected.has(member.id)}
                      onChange={() => toggleMember(member.id)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-ring/40"
                      aria-label={`Select ${member.name}`}
                    />
                  </label>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {member.name}
                      </p>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${stageTone[member.effectiveStage]}`}
                      >
                        {collectionStageLabel(member.effectiveStage)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-money">{fmtUSD(member.amountDue)}</span> due · {member.contact_count} contact{member.contact_count === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      Last contacted: {formatLastContact(member)}
                    </p>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Stage
                    </span>
                    <select
                      value={member.effectiveStage}
                      onChange={(event) =>
                        changeStage(member.id, event.target.value as CollectionStage)
                      }
                      className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
                    >
                      {COLLECTION_STAGES.map((stage) => (
                        <option key={stage.value} value={stage.value}>
                          {stage.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div>
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Log contact
                    </span>
                    <div className="flex gap-1.5">
                      <ContactButton
                        label="Email"
                        icon="email"
                        onClick={() =>
                          logContact(member.id, "email", nextContactStage(member))
                        }
                      />
                      <ContactButton
                        label="SMS"
                        icon="sms"
                        onClick={() =>
                          logContact(member.id, "sms", nextContactStage(member))
                        }
                      />
                      <ContactButton
                        label="Manual"
                        icon="manual"
                        onClick={() =>
                          logContact(member.id, "manual", nextContactStage(member))
                        }
                      />
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">Contact info</p>
                    <p className="mt-1 truncate">{member.email || "No email"}</p>
                    <p className="truncate">{member.phone || "No phone"}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="glass rounded-[1.5rem] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Last contacted
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  Recent outreach
                </h2>
              </div>
              <Clock3 className="h-5 w-5 text-muted-foreground" />
            </div>
            {lastContacted.length === 0 ? (
              <p className="text-sm text-muted-foreground/70">
                No contacts logged yet.
              </p>
            ) : (
              <div className="space-y-3">
                {lastContacted.map((member) => (
                  <div key={member.id} className="rounded-xl bg-muted/60 p-3">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {member.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(member.last_contacted_at)} ·{" "}
                      {channelLabel(member.last_contact_channel)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="glass rounded-[1.5rem] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Needs attention
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  Follow-up candidates
                </h2>
              </div>
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div className="space-y-3">
              {neverContacted.slice(0, 4).map((member) => (
                <AttentionItem
                  key={member.id}
                  name={member.name}
                  detail="Never contacted"
                />
              ))}
              {stale.slice(0, 4).map((member) => (
                <AttentionItem
                  key={member.id}
                  name={member.name}
                  detail={`${member.daysSinceContact} days since contact`}
                />
              ))}
              {neverContacted.length === 0 && stale.length === 0 && (
                <p className="text-sm text-muted-foreground/70">
                  No stale or untouched accounts.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({
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
    <section className="glass rounded-[1.5rem] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`font-money mt-2 text-2xl font-semibold ${
          tone === "good"
            ? "text-money-up"
            : tone === "bad"
              ? "text-money-down"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
    </section>
  );
}

function ContactButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ContactChannel;
  onClick: () => void;
}) {
  const Icon =
    icon === "email" ? Mail : icon === "sms" ? MessageSquareText : PhoneCall;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Log ${label}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function AttentionItem({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <p className="truncate text-sm font-semibold text-foreground">{name}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function toCollectionMember(
  member: MemberRow,
  period: PeriodRow
): CollectionMember {
  const setRate = member.status === "pledge" ? period.pledge_dues : period.active_dues;
  const effectiveStage =
    member.dues_paid === 1 ? "paid" : member.collection_stage || "not_contacted";
  return {
    ...member,
    effectiveStage,
    amountDue: memberEffectiveDues(
      member.aid_plan,
      member.aid_amount,
      period.dues_plans,
      setRate
    ),
    daysSinceContact: daysSince(member.last_contacted_at),
  };
}

function nextContactStage(member: CollectionMember): CollectionStage {
  if (member.effectiveStage === "not_contacted") return "reminder_sent";
  if (member.effectiveStage === "reminder_sent") return "follow_up";
  return member.effectiveStage;
}

function daysSince(raw: string | null): number | null {
  if (!raw) return null;
  const then = Date.parse(toIso(raw));
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

function toIso(raw: string | null): string {
  if (!raw) return "";
  return raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
}

function formatDateTime(raw: string | null): string {
  if (!raw) return "Never";
  const date = new Date(toIso(raw));
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatLastContact(member: CollectionMember): string {
  if (!member.last_contacted_at) return "Never";
  const days =
    member.daysSinceContact == null
      ? ""
      : member.daysSinceContact === 0
        ? "today"
        : `${member.daysSinceContact} day${member.daysSinceContact === 1 ? "" : "s"} ago`;
  return `${formatDateTime(member.last_contacted_at)}${days ? ` · ${days}` : ""}`;
}

function channelLabel(channel: ContactChannel | null): string {
  return CONTACT_CHANNELS.find((c) => c.value === channel)?.label ?? "Contact";
}
