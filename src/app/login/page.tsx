"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { AuthShell, inputCls, labelCls, primaryBtnCls } from "@/components/AuthShell";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});
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

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your chapter's account">
      <form ref={formRef} action={action} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            // Survives the post-action form reset so a wrong password doesn't
            // cost the user their email too. Keyed so the reset picks up the
            // echoed value rather than the empty initial one.
            key={state.values?.email ?? ""}
            defaultValue={state.values?.email ?? ""}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className={inputCls}
          />
        </div>
        {state.error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{state.error}</p>
        )}
        <button type="submit" disabled={pending} className={primaryBtnCls}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-sm text-muted-foreground mt-6 text-center">
        New here?{" "}
        <Link href="/signup" className="text-accent-foreground font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
