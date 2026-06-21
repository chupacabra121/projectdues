"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { FlashPayload } from "@/lib/flash";

const TONE: Record<
  FlashPayload["tone"],
  { icon: typeof Info; ring: string; text: string }
> = {
  good: { icon: CheckCircle2, ring: "ring-money-up/40", text: "text-money-up" },
  warn: { icon: AlertTriangle, ring: "ring-warning/40", text: "text-warning" },
  bad: { icon: XCircle, ring: "ring-destructive/40", text: "text-destructive" },
  info: { icon: Info, ring: "ring-border-strong", text: "text-muted-foreground" },
};

/**
 * Renders the pending flash (read server-side, passed in) as a bottom-right
 * toast, then clears the cookie so a later navigation can't replay it.
 *
 * Visibility is *derived* from the prop plus a `dismissed` nonce — the effect
 * only schedules a dismiss (and the cookie side effect), so there's no
 * synchronous setState in the effect body.
 */
export default function Toaster({ flash }: { flash: FlashPayload | null }) {
  // The nonce of the last flash the timer has dismissed.
  const [dismissed, setDismissed] = useState<number | null>(null);

  useEffect(() => {
    if (!flash) return;
    // Side effects only: consume the cookie, schedule the auto-dismiss.
    document.cookie = "sd-flash=; Max-Age=0; Path=/; SameSite=Lax";
    const id = window.setTimeout(() => setDismissed(flash.t), 4500);
    return () => window.clearTimeout(id);
  }, [flash]);

  const shown = flash && flash.t !== dismissed ? flash : null;
  if (!shown) return null;
  const { icon: Icon, ring, text } = TONE[shown.tone];

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex justify-end">
      <div
        role="status"
        aria-live="polite"
        className={`glass-elevated pointer-events-auto flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${ring}`}
      >
        <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${text}`} />
        <p className="text-foreground">{shown.message}</p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setDismissed(shown.t)}
          className="-mr-1 -mt-0.5 ml-1 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <XCircle className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
