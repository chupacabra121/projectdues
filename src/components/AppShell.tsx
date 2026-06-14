import Header from "./Header";
import { getActivePeriod, getPeriods } from "@/lib/db";

/**
 * Top chrome for the signed-in app: brand + main tabs + period switcher, with
 * the agent team strip right below — every page shares it.
 */
export default function AppShell({
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
  return (
    <>
      <Header
        chapterName={chapterName}
        periods={periods}
        activePeriodId={active?.id ?? null}
      />
      <main className="grid-substrate relative z-[1] flex-1">{children}</main>
    </>
  );
}
