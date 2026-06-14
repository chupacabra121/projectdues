"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import {
  setMemberDuesPlan,
  setMemberAidAmount,
  setMemberDuesPaid,
  setDuesRates,
  setDuesPlans,
} from "@/app/actions/dues";
import { MemberRow, PeriodRow } from "@/lib/db";
import { DuesPlan, memberEffectiveDues } from "@/lib/memberDues";
import { fmtUSD } from "@/lib/forecast";

const selectCls =
  "rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40";
const ROW_GRID = "grid-cols-[1fr_7.5rem_6.5rem_2.5rem]";

export default function DuesBoard({
  members,
  period,
}: {
  members: MemberRow[];
  period: PeriodRow;
}) {
  const plans = period.dues_plans;
  const actives = members.filter((m) => m.status === "active");
  const pledges = members.filter((m) => m.status === "pledge");

  return (
    <>
      <RatesPlansEditor period={period} />

      <div className="mt-6 space-y-5">
        <MemberSection
          title="Active members"
          hint="Most pay full dues — put anyone on a plan or give them an individual amount."
          members={actives}
          setRate={period.active_dues}
          plans={plans}
          empty="No active members on the roster yet."
        />
        <MemberSection
          title="Pledges"
          hint="Added as they join. Estimate financial-aid pledges with a plan."
          members={pledges}
          setRate={period.pledge_dues}
          plans={plans}
          empty="No pledges on the roster yet — they're added as they join."
        />
      </div>
    </>
  );
}

/** Editable set rates + the financial-aid plans (preset amounts). */
function RatesPlansEditor({ period }: { period: PeriodRow }) {
  const [, startTransition] = useTransition();
  const [activeDues, setActiveDues] = useState(String(period.active_dues));
  const [pledgeDues, setPledgeDues] = useState(String(period.pledge_dues));
  const [plans, setPlans] = useState<{ name: string; amount: string }[]>(
    period.dues_plans.map((p) => ({ name: p.name, amount: String(p.amount) }))
  );

  const saveRates = () => {
    const fd = new FormData();
    fd.set("activeDues", activeDues);
    fd.set("pledgeDues", pledgeDues);
    startTransition(() => setDuesRates(fd));
  };
  const savePlans = (next: { name: string; amount: string }[]) => {
    const fd = new FormData();
    fd.set(
      "plans",
      JSON.stringify(next.map((p) => ({ name: p.name, amount: Number(p.amount) || 0 })))
    );
    startTransition(() => setDuesPlans(fd));
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Set rates
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <RateField label="Active dues" value={activeDues} onChange={setActiveDues} onCommit={saveRates} />
        <RateField label="Pledge dues" value={pledgeDues} onChange={setPledgeDues} onCommit={saveRates} />
      </div>

      <p className="mb-3 mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Financial-aid plans
      </p>
      <div className="space-y-2">
        {plans.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={p.name}
              onChange={(e) => {
                const next = plans.map((q, j) => (j === i ? { ...q, name: e.target.value } : q));
                setPlans(next);
              }}
              onBlur={() => savePlans(plans)}
              className={`${selectCls} flex-1`}
              aria-label="Plan name"
            />
            <div className="relative w-32 flex-shrink-0">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input
                type="number" min={0} step="0.01"
                value={p.amount}
                onChange={(e) => {
                  const next = plans.map((q, j) => (j === i ? { ...q, amount: e.target.value } : q));
                  setPlans(next);
                }}
                onBlur={() => savePlans(plans)}
                className={`${selectCls} w-full pl-6`}
                aria-label="Plan preset amount"
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground/80">
        Members on a plan pay its preset amount unless you give them an individual
        amount below.
      </p>
    </section>
  );
}

function RateField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <input
          type="number" min={0} step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          className={`${selectCls} w-full pl-7`}
        />
      </div>
    </label>
  );
}

function MemberSection({
  title,
  hint,
  members,
  setRate,
  plans,
  empty,
}: {
  title: string;
  hint: string;
  members: MemberRow[];
  setRate: number;
  plans: DuesPlan[];
  empty: string;
}) {
  const subtotal = members.reduce(
    (sum, m) => sum + memberEffectiveDues(m.aid_plan, m.aid_amount, plans, setRate),
    0
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b border-border/60 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {title}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{members.length}</span>
          </h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="text-sm font-semibold text-primary">{fmtUSD(subtotal)}</span>
      </div>
      {members.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted-foreground/70">{empty}</p>
      ) : (
        <div className="divide-y divide-border/40">
          {members.map((m) => (
            <MemberDuesRow key={m.id} member={m} setRate={setRate} plans={plans} />
          ))}
        </div>
      )}
    </section>
  );
}

function MemberDuesRow({
  member,
  setRate,
  plans,
}: {
  member: MemberRow;
  setRate: number;
  plans: DuesPlan[];
}) {
  const [, startTransition] = useTransition();
  const onAid = member.aid_plan != null;
  const paid = member.dues_paid === 1;
  // What this member pays by default for their category (the input's placeholder).
  const defaultAmt = onAid ? plans[member.aid_plan!]?.amount ?? 0 : setRate;

  const changePlan = (val: string) => {
    const fd = new FormData();
    fd.set("id", String(member.id));
    fd.set("plan", val);
    startTransition(() => setMemberDuesPlan(fd));
  };
  const changeAmount = (val: string) => {
    const fd = new FormData();
    fd.set("id", String(member.id));
    fd.set("amount", val);
    startTransition(() => setMemberAidAmount(fd));
  };
  const togglePaid = () => {
    const fd = new FormData();
    fd.set("id", String(member.id));
    fd.set("paid", paid ? "0" : "1");
    startTransition(() => setMemberDuesPaid(fd));
  };

  return (
    <div className={`grid ${ROW_GRID} items-center gap-3 px-5 py-2.5`}>
      <span className="truncate text-sm font-medium text-foreground">{member.name}</span>

      <select
        value={onAid ? String(member.aid_plan) : "full"}
        onChange={(e) => changePlan(e.target.value)}
        className={selectCls}
        aria-label="Dues plan"
      >
        <option value="full">Full dues</option>
        {plans.map((p, i) => (
          <option key={i} value={i}>
            {p.name}
          </option>
        ))}
      </select>

      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <input
          key={`${member.aid_plan ?? "f"}-${member.aid_amount ?? "d"}`}
          type="number" min={0} step="0.01"
          defaultValue={member.aid_amount ?? ""}
          placeholder={String(defaultAmt)}
          onBlur={(e) => changeAmount(e.target.value)}
          aria-label="Dues amount"
          className="w-full rounded-lg border border-input bg-background py-1.5 pl-5 pr-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
        />
      </div>

      <button
        type="button"
        onClick={togglePaid}
        aria-label={paid ? "Mark unpaid" : "Mark paid"}
        title={paid ? "Paid — click to undo" : "Mark paid"}
        className={`flex h-6 w-6 items-center justify-center justify-self-center rounded-md border transition-colors ${
          paid
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input bg-background text-transparent hover:border-primary/50"
        }`}
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  );
}
