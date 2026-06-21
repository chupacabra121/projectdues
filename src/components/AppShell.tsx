import Header from "./Header";
import WorkspaceShell from "./WorkspaceShell";
import Toaster from "./Toaster";
import { getActivePeriod, getPeriods } from "@/lib/db";
import { getFlash } from "@/lib/flash";

/**
 * Top chrome for the signed-in app: brand + main tabs + period switcher, with
 * the agent team strip right below — every page shares it.
 */
export default async function AppShell({
  chapterName,
  userId,
  children,
}: {
  chapterName: string;
  userId: number;
  children: React.ReactNode;
}) {
  const periods = getPeriods(userId).map((p) => ({
    id: p.id,
    name: p.name,
    start: p.semester_start,
    end: p.semester_end,
  }));
  const active = getActivePeriod(userId);
  const flash = await getFlash();
  return (
    <>
      <Header
        chapterName={chapterName}
        periods={periods}
        activePeriodId={active?.id ?? null}
      />
      <main className="grid-substrate relative z-[1] flex-1">
        <WorkspaceShell>{children}</WorkspaceShell>
      </main>
      <Toaster flash={flash} />
    </>
  );
}
