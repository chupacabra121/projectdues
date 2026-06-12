import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { getAgent } from "@/lib/agents";
import AppShell from "@/components/AppShell";
import AgentTabs from "./tabs";

export default async function BudgetingAgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireOnboardedUser();
  const penny = getAgent("budgeting")!;

  return (
    <AppShell chapterName={user.chapter_name}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href="/agents"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All agents
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-2xl border border-border sm:h-16 sm:w-16">
              <Image
                src={penny.image}
                alt="Penny, your budgeting agent"
                fill
                sizes="64px"
                className="object-cover"
                priority
              />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-3xl text-foreground sm:text-4xl">
                Penny
                <span className="text-muted-foreground"> · Budgeting</span>
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Money in, money out, and what&apos;s left — answering &ldquo;can we
                afford what we&apos;re planning?&rdquo; before it&apos;s spent.
              </p>
            </div>
          </div>
        </div>

        <AgentTabs />

        <div className="mt-6">{children}</div>
      </div>
    </AppShell>
  );
}
