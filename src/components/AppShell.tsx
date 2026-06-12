import Link from "next/link";
import { Building2 } from "lucide-react";
import { logout } from "@/app/actions/auth";

/**
 * Top chrome for the signed-in app. Navigation happens through the agents
 * hub and each agent's subtabs — the header stays minimal on purpose.
 */
export default function AppShell({
  chapterName,
  children,
}: {
  chapterName: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/agents" className="font-display text-2xl tracking-tight text-foreground">
            Chapter<span className="text-primary">OS</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm text-foreground">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="max-w-[200px] truncate">{chapterName}</span>
            </span>
            <form action={logout}>
              <button className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
