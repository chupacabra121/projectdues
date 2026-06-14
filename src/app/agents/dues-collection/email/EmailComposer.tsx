"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Mail,
  Send,
  Users,
} from "lucide-react";
import { inputCls } from "@/components/AuthShell";
import { MemberRow, PeriodRow } from "@/lib/db";
import { fmtUSD } from "@/lib/forecast";
import { memberEffectiveDues } from "@/lib/memberDues";

type Audience = "everyone" | "unpaid" | "active" | "pledge" | "other";

const textAreaCls =
  "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40";

const audienceOptions: Array<{ value: Audience; label: string }> = [
  { value: "everyone", label: "Everyone" },
  { value: "unpaid", label: "Unpaid" },
  { value: "active", label: "Active" },
  { value: "pledge", label: "Pledges" },
  { value: "other", label: "Other" },
];

export default function EmailComposer({
  chapterName,
  members,
  period,
}: {
  chapterName: string;
  members: MemberRow[];
  period: PeriodRow;
}) {
  const [audience, setAudience] = useState<Audience>("everyone");
  const [subject, setSubject] = useState(`Dues reminder for ${period.name}`);
  const [body, setBody] = useState(defaultBody(chapterName, period.name));
  const [copied, setCopied] = useState("");

  const recipients = useMemo(
    () =>
      members
        .filter((member) => member.email.trim())
        .filter((member) => {
          if (audience === "everyone") return true;
          if (audience === "unpaid") {
            return (
              member.dues_paid !== 1 &&
              (member.status === "active" || member.status === "pledge")
            );
          }
          if (audience === "active") return member.status === "active";
          if (audience === "pledge") return member.status === "pledge";
          return member.status === "alumni" || member.status === "inactive";
        }),
    [audience, members]
  );

  const unpaidRecipients = recipients.filter(
    (member) =>
      member.dues_paid !== 1 &&
      (member.status === "active" || member.status === "pledge")
  );
  const expectedOpen = unpaidRecipients.reduce((sum, member) => {
    const setRate = member.status === "pledge" ? period.pledge_dues : period.active_dues;
    return (
      sum +
      memberEffectiveDues(
        member.aid_plan,
        member.aid_amount,
        period.dues_plans,
        setRate
      )
    );
  }, 0);
  const emailList = recipients.map((member) => member.email.trim()).join(", ");
  const mailtoHref = `mailto:?bcc=${encodeURIComponent(emailList)}&subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
  const longDraft = mailtoHref.length > 1800;

  async function copyText(label: string, text: string) {
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    }
    setCopied(ok ? `${label} copied` : "Copy failed");
    setTimeout(() => setCopied(""), 2200);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
      <section className="space-y-4">
        <div className="rounded-[1.5rem] border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Audience
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {recipients.length}
              </p>
            </div>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Users className="h-5 w-5" />
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {audienceOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setAudience(option.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                  audience === option.value
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Open dues
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {fmtUSD(expectedOpen)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {unpaidRecipients.length} unpaid billable recipients
          </p>
        </div>

        <div className="rounded-[1.5rem] border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Recipients
            </p>
            {copied && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                <Check className="h-3.5 w-3.5" />
                {copied}
              </span>
            )}
          </div>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
            {recipients.length === 0 ? (
              <p className="text-sm text-muted-foreground/70">
                No matching roster emails.
              </p>
            ) : (
              recipients.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {member.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  {member.dues_paid === 1 ? (
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-accent-foreground">
                      Paid
                    </span>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => copyText("BCC list", emailList)}
            disabled={recipients.length === 0}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            Copy BCC
          </button>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-border bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Broadcast email
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              Custom dues message
            </h2>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Mail className="h-5 w-5" />
          </span>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground/80">
            Subject
          </span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className={inputCls}
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium text-foreground/80">
            Message
          </span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={14}
            className={textAreaCls}
          />
        </label>

        {longDraft && (
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
            This draft is long for a mail link. Copy the BCC list and message if
            your email app trims it.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <a
            href={mailtoHref}
            className={`inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 ${
              recipients.length === 0 ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Send className="h-4 w-4" />
            Open Draft
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={() => copyText("Message", body)}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <Copy className="h-4 w-4" />
            Copy Message
          </button>
        </div>
      </section>
    </div>
  );
}

function defaultBody(chapterName: string, periodName: string): string {
  const signature = chapterName ? `${chapterName} Treasurer` : "Treasurer";
  return `Hi everyone,

This is a reminder to pay dues for ${periodName}. Please send payment when you can, and reply here if you have any questions about your balance or payment timing.

Thank you,
${signature}`;
}
