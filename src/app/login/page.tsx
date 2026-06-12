"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login } from "@/app/actions/auth";
import { AuthShell, inputCls, labelCls, primaryBtnCls } from "@/components/AuthShell";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {});

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your chapter's account">
      <form action={action} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className={inputCls} placeholder="treasurer@chapter.org" />
        </div>
        <div>
          <label className={labelCls} htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required className={inputCls} placeholder="••••••••" />
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
        <Link href="/signup" className="text-primary font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
