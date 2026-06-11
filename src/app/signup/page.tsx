"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { AuthShell, inputCls, labelCls, primaryBtnCls } from "@/components/AuthShell";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, {});

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up budgeting and forecasting for your chapter"
    >
      <form action={action} className="space-y-4">
        <div>
          <label className={labelCls} htmlFor="chapter_name">Chapter / Organization name</label>
          <input id="chapter_name" name="chapter_name" type="text" required className={inputCls} placeholder="Sigma Chi — Beta Theta" />
        </div>
        <div>
          <label className={labelCls} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className={inputCls} placeholder="treasurer@chapter.org" />
        </div>
        <div>
          <label className={labelCls} htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required minLength={8} className={inputCls} placeholder="At least 8 characters" />
        </div>
        {state.error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
        )}
        <button type="submit" disabled={pending} className={primaryBtnCls}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-gray-500 mt-6 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-indigo-600 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
