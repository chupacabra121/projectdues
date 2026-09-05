"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { AuthShell, inputCls, labelCls, primaryBtnCls } from "@/components/AuthShell";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Put the cursor on the field the error is about. autoFocus can't do this —
  // the inputs never remount. Depends on `state` (a fresh object per attempt)
  // so it re-fires on a repeat failure carrying the identical message.
  useEffect(() => {
    if (!state.field) return;
    formRef.current
      ?.querySelector<HTMLInputElement>(`[name="${state.field}"]`)
      ?.focus();
  }, [state]);

  // Echoed back by the action so a rejected submit doesn't wipe the form.
  // Keyed as well as defaulted, so React's post-action reset restores the typed
  // value rather than the empty initial one.
  const keep = (name: string) => ({
    key: state.values?.[name] ?? "",
    defaultValue: state.values?.[name] ?? "",
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up budgeting and forecasting for your chapter"
    >
      <form ref={formRef} action={action} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="first_name">First name</label>
            <input id="first_name" name="first_name" type="text" required autoComplete="given-name" {...keep("first_name")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="last_name">Last name</label>
            <input id="last_name" name="last_name" type="text" autoComplete="family-name" {...keep("last_name")} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="chapter_name">Chapter / Organization name</label>
          <input id="chapter_name" name="chapter_name" type="text" required {...keep("chapter_name")} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" {...keep("email")} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputCls} />
        </div>
        {state.error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{state.error}</p>
        )}
        <button type="submit" disabled={pending} className={primaryBtnCls}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-muted-foreground mt-6 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-accent-foreground font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
