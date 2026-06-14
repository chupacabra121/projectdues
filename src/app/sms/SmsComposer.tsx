"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  MessageSquareText,
  Send,
  Smartphone,
  Users,
} from "lucide-react";
import {
  logMembersContact,
  setPaymentInstructions,
} from "@/app/actions/collections";
import type { MemberRow, PeriodRow } from "@/lib/db";
import { fmtUSD } from "@/lib/forecast";
import { memberEffectiveDues } from "@/lib/memberDues";

type Audience = "everyone" | "unpaid" | "active" | "pledge" | "other";
type ComposerMode = "broadcast" | "individual";
type SmsTemplate = {
  id: string;
  name: string;
  message: string;
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

const smsTemplates: SmsTemplate[] = [
  {
    id: "friendly",
    name: "Friendly",
    message:
      "Hi {firstName}, quick reminder that dues for {periodName} are {duesAmount}. {paymentLink} - {chapterName} Treasurer",
  },
  {
    id: "due-today",
    name: "Due today",
    message:
      "Hi {firstName}, dues are due today for {periodName}. Your amount is {duesAmount}. {paymentLink}",
  },
  {
    id: "overdue",
    name: "Overdue",
    message:
      "Hi {firstName}, following up because dues for {periodName} still show unpaid. Amount: {duesAmount}. Reply if you've already paid.",
  },
  {
    id: "payment-plan",
    name: "Payment plan",
    message:
      "Hi {firstName}, checking in about dues for {periodName}. Your amount is {duesAmount}. Reply if you need to talk through timing.",
  },
  {
    id: "thank-you",
    name: "Thank you",
    message:
      "Hi {firstName}, thank you for paying dues for {periodName}. I've marked you as paid. - {chapterName} Treasurer",
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

export default function SmsComposer({
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
  const [audience, setAudience] = useState<Audience>("unpaid");
  const [message, setMessage] = useState(defaultMessage(chapterName, period.name));
  const [paymentLink, setPaymentLink] = useState(
    period.collection_payment_instructions ?? ""
  );
  const [copied, setCopied] = useState("");

  const recipients = useMemo(
    () =>
      members
        .filter((member) => member.phone.trim())
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

  const phones = recipients.map((member) => cleanPhone(member.phone));
  const phoneList = phones.join(", ");
  const broadcastMessage = renderTemplate(
    message,
    null,
    period,
    chapterName,
    paymentLink
  );
  const smsHref = `sms:${phones.join(",")}?&body=${encodeURIComponent(
    broadcastMessage
  )}`;
  const longMessage = message.length > 160;
  const individualDrafts = recipients.map((member) => ({
    member,
    message: renderTemplate(message, member, period, chapterName, paymentLink),
  }));
  const allIndividualDrafts = individualDrafts
    .map((draft) => `${draft.member.name} <${draft.member.phone}>\n${draft.message}`)
    .join("\n\n---\n\n");

  function applyTemplate(template: SmsTemplate) {
    setMessage(template.message);
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
    fd.set("channel", "sms");
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

        <div className="rounded-[1.5rem] glass p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Templates
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {smsTemplates.map((template) => (
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
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
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Message length
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {message.length}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {longMessage ? "May split into multiple SMS parts" : "Fits a standard SMS"}
            </p>
          </div>
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
                No matching roster phone numbers.
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
                      {member.phone}
                    </p>
                  </div>
                  <a
                    href={`sms:${cleanPhone(member.phone)}?&body=${encodeURIComponent(
                      renderTemplate(message, member, period, chapterName, paymentLink)
                    )}`}
                    onClick={() => logContacts([member.id])}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    Draft
                  </a>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => copyText("Phone list", phoneList)}
            disabled={recipients.length === 0}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            Copy Phones
          </button>
        </div>
      </section>

      <section className="rounded-[1.5rem] glass p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {mode === "broadcast" ? "Broadcast SMS" : "Individual SMS"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              Custom text message
            </h2>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MessageSquareText className="h-5 w-5" />
          </span>
        </div>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-foreground/80">
            Payment link or instructions
          </span>
          <input
            value={paymentLink}
            onChange={(event) => setPaymentLink(event.target.value)}
            onBlur={savePaymentInstructions}
            placeholder="Venmo @chapter, Zelle treasurer@example.com, or a payment URL"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="button"
            onClick={savePaymentInstructions}
            className="mt-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Save instructions
          </button>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground/80">
            Message
          </span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={12}
            className={textAreaCls}
          />
        </label>

        {mode === "broadcast" && (
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
            Group SMS support depends on the device and messaging app. If the
            draft does not include everyone, copy the phone list or use
            individual mode.
          </p>
        )}

        {mode === "broadcast" ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <a
              href={smsHref}
              onClick={() => logContacts(recipients.map((member) => member.id))}
              className={`inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 ${
                recipients.length === 0 ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <Send className="h-4 w-4" />
              Open Group Draft
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => {
                copyText("Message", broadcastMessage);
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
            <button
              type="button"
              onClick={() => {
                copyText("Individual texts", allIndividualDrafts);
                logContacts(individualDrafts.map((draft) => draft.member.id));
              }}
              disabled={individualDrafts.length === 0}
              className="mb-3 inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Copy className="h-4 w-4" />
              Copy All Texts
            </button>
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
                        {draft.member.phone}
                      </p>
                    </div>
                    <a
                      href={`sms:${cleanPhone(
                        draft.member.phone
                      )}?&body=${encodeURIComponent(draft.message)}`}
                      onClick={() => logContacts([draft.member.id])}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Draft
                    </a>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                    {draft.message}
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

function cleanPhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function defaultMessage(chapterName: string, periodName: string): string {
  const sender = chapterName ? `${chapterName} Treasurer` : "Treasurer";
  return `Hi, quick reminder to pay dues for ${periodName}. Reply here if you have questions. - ${sender}`;
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
