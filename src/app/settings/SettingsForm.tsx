"use client";

import { useState, useTransition } from "react";
import {
  Bell,
  Building2,
  Check,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  User,
} from "lucide-react";
import { updateAccount } from "@/app/actions/account";
import { UserPreferences } from "@/lib/db";
import { inputCls, labelCls } from "@/components/AuthShell";

interface Initial {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  title: string;
  chapterName: string;
}

export default function SettingsForm({
  initial,
  preferences,
}: {
  initial: Initial;
  preferences: UserPreferences;
}) {
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [phone, setPhone] = useState(initial.phone);
  const [title, setTitle] = useState(initial.title);
  const [chapterName, setChapterName] = useState(initial.chapterName);
  const [prefs, setPrefs] = useState<UserPreferences>(preferences);

  const snapshot = (
    f: string,
    l: string,
    p: string,
    t: string,
    c: string,
    pr: UserPreferences
  ) => JSON.stringify({ f, l, p, t, c, pr });

  const [baseline, setBaseline] = useState(() =>
    snapshot(
      initial.firstName,
      initial.lastName,
      initial.phone,
      initial.title,
      initial.chapterName,
      preferences
    )
  );
  const [isPending, startTransition] = useTransition();

  const current = snapshot(firstName, lastName, phone, title, chapterName, prefs);
  const dirty = current !== baseline;

  const setPref = <K extends keyof UserPreferences>(
    k: K,
    v: UserPreferences[K]
  ) => setPrefs((p) => ({ ...p, [k]: v }));

  function save() {
    startTransition(async () => {
      await updateAccount({ firstName, lastName, phone, title, chapterName, preferences: prefs });
      setBaseline(current);
    });
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-foreground sm:text-4xl">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account, contact details, and how SimpleDues reaches you.
          </p>
        </div>
        <SaveButton dirty={dirty} pending={isPending} onSave={save} />
      </div>

      {/* Profile */}
      <Section icon={User} title="Profile" desc="Your name and role on the chapter exec.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" />
          <Field label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" />
          <Field label="Title / Role" value={title} onChange={setTitle} />
          <div className="sm:col-span-2">
            <FieldIcon icon={Building2} label="Chapter / Organization">
              <input
                className={inputCls}
                value={chapterName}
                onChange={(e) => setChapterName(e.target.value)}
              />
            </FieldIcon>
            <p className="mt-1 text-xs text-muted-foreground">
              Shown across the app and on dues reminders.
            </p>
          </div>
        </div>
      </Section>

      {/* Contact */}
      <Section icon={Mail} title="Contact" desc="How members and SimpleDues reach you.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Sign-in email</label>
            <input className={`${inputCls} opacity-70`} value={initial.email} disabled readOnly />
            <p className="mt-1 text-xs text-muted-foreground">
              This is your login — contact support to change it.
            </p>
          </div>
          <Field label="Phone" value={phone} onChange={setPhone} type="tel" autoComplete="tel" />
        </div>
      </Section>

      {/* Notifications */}
      <Section icon={Bell} title="Notifications" desc="Choose what SimpleDues pings you about.">
        <div className="divide-y divide-border/60">
          <ToggleRow
            label="Email notifications"
            desc="Account and budget activity to your inbox."
            checked={prefs.emailNotifications}
            onChange={(v) => setPref("emailNotifications", v)}
          />
          <ToggleRow
            label="Text message alerts"
            desc="Time-sensitive alerts by SMS."
            checked={prefs.smsNotifications}
            onChange={(v) => setPref("smsNotifications", v)}
          />
          <ToggleRow
            label="Dues reminders"
            desc="When a member's payment is coming due or overdue."
            checked={prefs.duesReminders}
            onChange={(v) => setPref("duesReminders", v)}
          />
          <ToggleRow
            label="Payment alerts"
            desc="A heads-up each time dues are collected."
            checked={prefs.paymentAlerts}
            onChange={(v) => setPref("paymentAlerts", v)}
          />
          <ToggleRow
            label="Weekly summary"
            desc="A Monday recap of collections and cash flow."
            checked={prefs.weeklySummary}
            onChange={(v) => setPref("weeklySummary", v)}
          />
          <div className="pt-4">
            <SelectField
              label="Notification frequency"
              value={prefs.notifyFrequency}
              onChange={(v) => setPref("notifyFrequency", v)}
              options={[
                ["realtime", "Real-time"],
                ["daily", "Daily digest"],
                ["weekly", "Weekly digest"],
              ]}
            />
          </div>
        </div>
      </Section>

      {/* Display & preferences */}
      <Section
        icon={SlidersHorizontal}
        title="Display & preferences"
        desc="How numbers, dates, and the app behave for you."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Currency"
            value={prefs.currency}
            onChange={(v) => setPref("currency", v)}
            options={[
              ["USD", "USD — US Dollar"],
              ["CAD", "CAD — Canadian Dollar"],
              ["GBP", "GBP — British Pound"],
              ["EUR", "EUR — Euro"],
              ["AUD", "AUD — Australian Dollar"],
            ]}
          />
          <SelectField
            label="Date format"
            value={prefs.dateFormat}
            onChange={(v) => setPref("dateFormat", v)}
            options={[
              ["MMM D, YYYY", "Mar 12, 2026"],
              ["MM/DD/YYYY", "03/12/2026"],
              ["DD/MM/YYYY", "12/03/2026"],
              ["YYYY-MM-DD", "2026-03-12"],
            ]}
          />
          <SelectField
            label="Week starts on"
            value={prefs.weekStart}
            onChange={(v) => setPref("weekStart", v)}
            options={[
              ["sunday", "Sunday"],
              ["monday", "Monday"],
            ]}
          />
          <SelectField
            label="Fiscal year starts"
            value={prefs.fiscalYearStart}
            onChange={(v) => setPref("fiscalYearStart", v)}
            options={MONTHS.map((m) => [m, m] as [string, string])}
          />
          <div className="sm:col-span-2">
            <SelectField
              label="Open the app to"
              value={prefs.defaultLanding}
              onChange={(v) => setPref("defaultLanding", v)}
              options={[
                ["/dashboard", "Dashboard"],
                ["/budget", "Budget"],
                ["/members", "Members"],
                ["/dues", "Dues"],
                ["/collections", "Collections"],
              ]}
            />
          </div>
        </div>
      </Section>

      {/* Security */}
      <Section icon={ShieldCheck} title="Security" desc="Keep your chapter's account protected.">
        <div className="divide-y divide-border/60">
          <ToggleRow
            label="Two-factor authentication"
            desc="Require a one-time code at sign-in."
            checked={prefs.twoFactor}
            onChange={(v) => setPref("twoFactor", v)}
          />
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">Password</p>
              <p className="text-xs text-muted-foreground">Last changed when you created the account.</p>
            </div>
            <SoonButton label="Change password" />
          </div>
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">Active sessions</p>
              <p className="text-xs text-muted-foreground">This device · active now</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-accent-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />
              1 active
            </span>
          </div>
        </div>
      </Section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <TriangleAlert className="h-4 w-4 text-destructive" />
          <h2 className="font-semibold text-foreground">Danger zone</h2>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Delete this account</p>
            <p className="text-xs text-muted-foreground">
              Permanently removes your chapter, roster, and every budget. This can&apos;t be undone.
            </p>
          </div>
          <SoonButton label="Delete account" destructive icon={Trash2} />
        </div>
      </section>
    </div>
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/* ─── pieces ─────────────────────────────────────────────────────────── */

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof User;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass glass-lift rounded-2xl p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-accent-foreground ring-1 ring-primary/25">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="font-semibold leading-tight text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type={type}
        className={inputCls}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FieldIcon({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={`${labelCls} flex items-center gap-1.5`}>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </label>
      {children}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SaveButton({
  dirty,
  pending,
  onSave,
}: {
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
}) {
  if (!dirty && !pending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-money-up">
        <Check className="h-4 w-4" />
        All changes saved
      </span>
    );
  }
  return (
    <button
      onClick={onSave}
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}

/** A placeholder action that isn't wired up yet — mirrors the app's "Coming
 *  soon" convention (used by the onboarding import options). */
function SoonButton({
  label,
  destructive,
  icon: Icon,
}: {
  label: string;
  destructive?: boolean;
  icon?: typeof User;
}) {
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className={`inline-flex shrink-0 cursor-not-allowed items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium opacity-60 ${
        destructive
          ? "border-destructive/40 text-destructive"
          : "border-border text-foreground"
      }`}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {label}
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        Soon
      </span>
    </button>
  );
}
