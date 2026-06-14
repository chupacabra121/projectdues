"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Mail,
  Send,
  Users,
} from "lucide-react";
import {
  logMembersContact,
  setPaymentInstructions,
} from "@/app/actions/collections";
import { inputCls } from "@/components/AuthShell";
import type { MemberRow, PeriodRow } from "@/lib/db";
import { fmtUSD } from "@/lib/forecast";
import { memberEffectiveDues } from "@/lib/memberDues";

type Audience = "everyone" | "unpaid" | "active" | "pledge" | "other";
type ComposerMode = "broadcast" | "individual";
type RecipientMode = "bcc" | "cc" | "to";
type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

const textAreaCls =
  "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40";

const audienceOptions: Array<{ value: Audience; label: string }> = [
  { value: "everyone", label: "Everyone" },
  { value: "unpaid", label: "Unpaid" },
  { value: "active", label: "Active" },
  { value: "pledge", label: "Pledges" },
  { value: "other", label: "Other" },
];

const recipientModeOptions: Array<{ value: RecipientMode; label: string }> = [
  { value: "bcc", label: "BCC" },
  { value: "cc", label: "CC" },
  { value: "to", label: "To" },
];

const emailTemplates: EmailTemplate[] = [
  {
    id: "friendly",
    name: "Friendly reminder",
    subject: "Dues reminder for {periodName}",
    body: `Hi {firstName},

This is a friendly reminder that dues for {periodName} are {duesAmount}. {paymentLink}

Reply here if you have any questions.

Thank you,
{chapterName} Treasurer`,
  },
  {
    id: "due-today",
    name: "Due today",
    subject: "Dues are due today",
    body: `Hi {firstName},

Dues for {periodName} are due today. Your amount is {duesAmount}. {paymentLink}

Please reply if you need help sorting out timing.

Thank you,
{chapterName} Treasurer`,
  },
  {
    id: "overdue",
    name: "Overdue follow-up",
    subject: "Follow-up on unpaid dues",
    body: `Hi {firstName},

I'm following up because dues for {periodName} still show as unpaid. Your current amount is {duesAmount}. {paymentLink}

If you've already paid, send me a quick note so I can mark it down.

Thank you,
{chapterName} Treasurer`,
  },
  {
    id: "payment-plan",
    name: "Payment plan",
    subject: "Checking in about dues",
    body: `Hi {firstName},

I'm checking in about dues for {periodName}. Your current amount is {duesAmount}. If paying all at once is hard, reply here and we can talk through timing.

Thank you,
{chapterName} Treasurer`,
  },
  {
    id: "thank-you",
    name: "Thank you",
    subject: "Dues payment received",
    body: `Hi {firstName},

Thank you for paying dues for {periodName}. I've marked you as paid.

Thank you,
{chapterName} Treasurer`,
  },
];

const tokenLabels = [
  "{firstName}",
  "{name}",
  "{duesAmount}",
  "{periodName}",
  "{chapterName}",
  "{paymentLink}",
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
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<ComposerMode>("broadcast");
  const [audience, setAudience] = useState<Audience>("everyone");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("bcc");
  const [subject, setSubject] = useState(`Dues reminder for ${period.name}`);
  const [body, setBody] = useState(defaultBody(chapterName, period.name));
  const [paymentLink, setPaymentLink] = useState(
    period.collection_payment_instructions ?? ""
  );
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
  const broadcastSubject = renderTemplate(
    subject,
    null,
    period,
    chapterName,
    paymentLink
  );
  const broadcastBody = renderTemplate(body, null, period, chapterName, paymentLink);
  const encodedList = encodeURIComponent(emailList);
  const recipientQuery =
    recipientMode === "to"
      ? encodedList
      : `?${recipientMode}=${encodedList}`;
  const separator = recipientMode === "to" ? "?" : "&";
  const mailtoHref = `mailto:${recipientQuery}${separator}subject=${encodeURIComponent(
    broadcastSubject
  )}&body=${encodeURIComponent(broadcastBody)}`;
  const longDraft = mailtoHref.length > 1800;
  const recipientModeLabel =
    recipientModeOptions.find((option) => option.value === recipientMode)?.label ??
    "Recipients";
  const individualDrafts = recipients.map((member) => ({
    member,
    subject: renderTemplate(subject, member, period, chapterName, paymentLink),
    body: renderTemplate(body, member, period, chapterName, paymentLink),
  }));
  const allIndividualDrafts = individualDrafts
    .map(
      (draft) =>
        `${draft.member.name} <${draft.member.email}>\nSubject: ${draft.subject}\n\n${draft.body}`
    )
    .join("\n\n---\n\n");

  function applyTemplate(template: EmailTemplate) {
    setSubject(template.subject);
    setBody(template.body);
  }

  function savePaymentInstructions() {
    const fd = new FormData();
    fd.set("paymentInstructions", paymentLink);
    startTransition(() => setPaymentInstructions(fd));
  }

  function logContacts(ids: number[]) {
    if (ids.length === 0) return;
    const fd = new FormData();
    fd.set("ids", ids.join(","));
    fd.set("channel", "email");
    fd.set("stage", "reminder_sent");
    startTransition(() => logMembersContact(fd));
  }

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
        <div className="rounded-[1.5rem] glass p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mode
          </p>
          <div className="mt-3 flex rounded-full border border-border bg-background p-0.5">
            {([
              ["broadcast", "Broadcast"],
              ["individual", "Individual"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                  mode === value
                    ? "bg-primary/15 text-accent-foreground ring-1 ring-primary/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] glass p-5">
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
                    ? "bg-primary/15 text-accent-foreground ring-1 ring-primary/30"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {mode === "broadcast" && (
          <div className="rounded-[1.5rem] glass p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Send as
            </p>
            <div className="mt-3 flex rounded-full border border-border bg-background p-0.5">
              {recipientModeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRecipientMode(option.value)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                    recipientMode === option.value
                      ? "bg-primary/15 text-accent-foreground ring-1 ring-primary/30"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground/80">
              BCC keeps member emails private. CC and To make recipients visible.
            </p>
          </div>
        )}

        <div className="rounded-[1.5rem] glass p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Templates
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {emailTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template)}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                {template.name}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {tokenLabels.map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => copyText("Token", token)}
                className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                {token}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] glass p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Open dues
          </p>
          <p className="mt-2 text-2xl font-semibold text-foreground font-money">
            {fmtUSD(expectedOpen)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {unpaidRecipients.length} unpaid billable recipients
          </p>
        </div>

        <div className="rounded-[1.5rem] glass p-5">
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
            onClick={() => copyText(`${recipientModeLabel} list`, emailList)}
            disabled={recipients.length === 0}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            Copy {recipientModeLabel}
          </button>
        </div>
      </section>

      <section className="rounded-[1.5rem] glass p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {mode === "broadcast" ? "Broadcast email" : "Individual email"}
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
            Payment link or instructions
          </span>
          <input
            value={paymentLink}
            onChange={(event) => setPaymentLink(event.target.value)}
            onBlur={savePaymentInstructions}
            placeholder="Venmo @chapter, Zelle treasurer@example.com, or a payment URL"
            className={inputCls}
          />
          <button
            type="button"
            onClick={savePaymentInstructions}
            className="mt-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Save instructions
          </button>
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
            This draft is long for a mail link. Copy the recipient list and message if
            your email app trims it.
          </p>
        )}

        {mode === "broadcast" ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <a
              href={mailtoHref}
              onClick={() => logContacts(recipients.map((member) => member.id))}
              className={`inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 ${
                recipients.length === 0 ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <Send className="h-4 w-4" />
              Open {recipientModeLabel} Draft
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => {
                copyText("Message", broadcastBody);
                logContacts(recipients.map((member) => member.id));
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Copy className="h-4 w-4" />
              Copy Message
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  copyText("Individual drafts", allIndividualDrafts);
                  logContacts(individualDrafts.map((draft) => draft.member.id));
                }}
                disabled={individualDrafts.length === 0}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                Copy All Drafts
              </button>
            </div>
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
              {individualDrafts.map((draft) => (
                <div
                  key={draft.member.id}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {draft.member.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {draft.member.email}
                      </p>
                    </div>
                    <a
                      href={`mailto:${encodeURIComponent(
                        draft.member.email.trim()
                      )}?subject=${encodeURIComponent(
                        draft.subject
                      )}&body=${encodeURIComponent(draft.body)}`}
                      onClick={() => logContacts([draft.member.id])}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Draft
                    </a>
                  </div>
                  <p className="mt-2 text-xs font-medium text-foreground">
                    {draft.subject}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                    {draft.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

function duesAmount(member: MemberRow, period: PeriodRow): string {
  const setRate = member.status === "pledge" ? period.pledge_dues : period.active_dues;
  return fmtUSD(
    memberEffectiveDues(member.aid_plan, member.aid_amount, period.dues_plans, setRate)
  );
}

function renderTemplate(
  template: string,
  member: MemberRow | null,
  period: PeriodRow,
  chapterName: string,
  paymentLink: string
): string {
  const replacements: Record<string, string> = {
    "{firstName}": member ? firstName(member.name) : "everyone",
    "{name}": member?.name ?? "everyone",
    "{duesAmount}": member ? duesAmount(member, period) : "your dues",
    "{periodName}": period.name,
    "{chapterName}": chapterName || "Chapter",
    "{paymentLink}": paymentLink.trim() || "Use the chapter payment instructions on file.",
  };
  return Object.entries(replacements).reduce(
    (text, [token, value]) => text.split(token).join(value),
    template
  );
}

function defaultBody(chapterName: string, periodName: string): string {
  const signature = chapterName ? `${chapterName} Treasurer` : "Treasurer";
  return `Hi everyone,

This is a reminder to pay dues for ${periodName}. Please send payment when you can, and reply here if you have any questions about your balance or payment timing.

Thank you,
${signature}`;
}
