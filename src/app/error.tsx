"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Root error boundary — catches render/action errors inside the app body and
 * offers a recovery path instead of a blank page. Kept self-contained (no DB,
 * no shell) so a failure in the chrome can't take the boundary down with it.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const showDetail = process.env.NODE_ENV !== "production";

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="glass-elevated w-full max-w-md rounded-3xl p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We hit an unexpected error loading this page. Your data is safe — try
          again, or head back to the dashboard.
        </p>
        {showDetail && error?.message && (
          <pre className="mt-4 overflow-x-auto rounded-xl bg-muted/60 p-3 text-left text-xs text-muted-foreground">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={reset}
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-full border border-border px-5 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
