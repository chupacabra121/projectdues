import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3 } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { getAgent } from "@/lib/agents";
import AppShell from "@/components/AppShell";

export default async function AgentTeaserPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) notFound();
  // Active agents work out of the main tabs; this dynamic route only hosts
  // the in-preparation team members.
  if (agent.status === "active") redirect(agent.href);

  const user = await requireOnboardedUser();

  return (
    <AppShell chapterName={user.chapter_name}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          {/* Profile */}
          <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-7">
            <div className="flex items-start gap-4">
              <span className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-3xl border border-border">
                <Image
                  src={agent.image}
                  alt={`${agent.name}, ${agent.role} agent`}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </span>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5" />
                  Coming soon
                </span>
                <h1 className="mt-2 font-display text-3xl text-foreground">
                  {agent.name}
                </h1>
                <p className="text-sm font-medium text-muted-foreground">
                  {agent.role} Agent — “{agent.tagline}”
                </p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-muted-foreground">
              {agent.description}
            </p>

            {/* Planned subtabs, visible but locked */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {agent.subtabs.map((tab) => (
                <span
                  key={tab}
                  className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-full border border-dashed border-border bg-background px-4 text-sm font-medium text-muted-foreground"
                >
                  {tab}
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground/80">
              {agent.name}&apos;s workspace — these tabs unlock when the agent goes live.
            </p>
          </section>

          {/* What they'll own + what you can do today */}
          <div className="space-y-5">
            <section className="rounded-[1.5rem] border border-border bg-card p-6">
              <h2 className="font-semibold text-foreground">
                What {agent.name} will own
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {agent.focus.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3"
                  >
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />
                    <span className="text-sm font-medium text-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </section>

            {agent.today && (
              <section className="rounded-[2rem] border border-border bg-foreground p-6 text-background sm:p-7">
                <p className="text-xs font-semibold uppercase tracking-wide text-background/60">
                  In the meantime
                </p>
                <p className="mt-3 text-sm leading-6 text-background/80">
                  {agent.today.text}
                </p>
                <Link
                  href={agent.today.href}
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-background px-4 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
                >
                  {agent.today.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </section>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
