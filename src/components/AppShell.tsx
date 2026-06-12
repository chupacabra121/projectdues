import Header from "./Header";

/**
 * Top chrome for the signed-in app: brand + main tabs, with the agent team
 * strip right below — every page shares it, the dashboard is the home tab.
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
      <Header chapterName={chapterName} />
      <main className="flex-1">{children}</main>
    </>
  );
}
