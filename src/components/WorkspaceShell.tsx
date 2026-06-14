"use client";

import { usePathname } from "next/navigation";
import { activeAgentFor } from "@/lib/agents";
import WorkspaceRail from "./WorkspaceRail";

/**
 * Lays the active agent's workspace out as [rail | content]. On non-agent routes
 * (dashboard, members, periods) and the "soon"-agent teasers it renders children
 * untouched, so those pages are byte-identical to before. The arbitrary variant
 * neutralizes each page's own centering so its content fills the right column
 * instead of re-centering inside it (vertical padding is preserved).
 */
export default function WorkspaceShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const agent = activeAgentFor(pathname);
  if (!agent?.navTabs) return <>{children}</>;

  return (
    <div className="mx-auto flex max-w-[78rem] gap-6 px-4 sm:px-6">
      <WorkspaceRail key={agent.slug} agent={agent} pathname={pathname} />
      <div className="min-w-0 flex-1 [&>div]:mx-0 [&>div]:max-w-none [&>div]:px-0">
        {children}
      </div>
    </div>
  );
}
