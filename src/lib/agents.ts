/**
 * The SimpleDues agent team. One place for names, faces, and what each agent
 * owns — the hub, teaser pages, and agent layouts all read from here.
 */

export interface AgentProfile {
  slug: string;
  /** Where tapping the agent takes you — Penny's office is the main tabs. */
  href: string;
  name: string;
  role: string;
  status: "active" | "soon";
  /** The small avatar shown on the team strip and cards. */
  image: string;
  /** A larger portrait for the expanded spotlight; falls back to `image`. */
  portrait?: string;
  /** Short line under the name on the avatar strip and cards. */
  tagline: string;
  description: string;
  focus: string[];
  subtabs: string[];
  /**
   * Real, navigable sub-tabs for an active agent — shown in the header only
   * while you're inside this agent's workspace. The agent is considered
   * "selected" when the current path matches one of these.
   */
  navTabs?: { href: string; label: string }[];
  /** What the chapter can already do today, while the agent is in prep. */
  today?: { text: string; href: string; label: string };
}

export const AGENTS: AgentProfile[] = [
  {
    slug: "budgeting",
    href: "/budget",
    name: "Penny",
    role: "Budgeting",
    status: "active",
    image: "/agents/penny.png",
    tagline: "Can we afford it?",
    description:
      "Penny watches money in and money out, keeps the semester forecast live, and answers the only question that matters: can we afford what we're planning?",
    focus: ["Semester plan", "Plan vs actual", "Member dues", "Recruitment scenarios"],
    subtabs: ["Budget", "Dues", "Plan vs Actual", "Scenarios"],
    navTabs: [
      { href: "/budget", label: "Budget" },
      { href: "/dues", label: "Dues" },
      { href: "/actuals", label: "Plan vs Actual" },
      { href: "/scenarios", label: "Scenarios" },
    ],
  },
  {
    slug: "dues-collection",
    href: "/email",
    name: "Dunn",
    role: "Dues Collection",
    status: "active",
    image: "/agents/dunn.png",
    tagline: "Politely relentless.",
    description:
      "Dunn sends dues reminders by email and text, escalates gently when payments slip, and reports what's been collected — built on the member roster Penny already keeps.",
    focus: ["Email reminders", "SMS reminders", "Escalation ladder", "Collections report"],
    subtabs: ["Email", "SMS", "Collections"],
    navTabs: [
      { href: "/email", label: "Email" },
      { href: "/sms", label: "SMS" },
      { href: "/collections", label: "Collections" },
    ],
  },
  {
    slug: "recruitment",
    href: "/agents/recruitment",
    name: "Russ",
    role: "Recruitment",
    status: "soon",
    image: "/agents/russ.png",
    tagline: "Every bid counts.",
    description:
      "Russ will track the pledge pipeline against your recruitment scenarios and flag when rush spending isn't translating into signed bids.",
    focus: ["Pledge pipeline", "Rush budget", "Bid tracking", "Scenario check-ins"],
    subtabs: ["Pipeline", "Rush Budget", "Bids"],
    today: {
      text: "Until Russ arrives: stress-test conservative, expected, and optimistic pledge classes with Penny.",
      href: "/scenarios",
      label: "Open scenarios",
    },
  },
  {
    slug: "events",
    href: "/agents/events",
    name: "Evie",
    role: "Events",
    status: "soon",
    image: "/agents/evie.png",
    tagline: "Formal, handled.",
    description:
      "Evie will keep every event's deposits, deadlines, and per-person costs in view so formal season doesn't surprise the budget.",
    focus: ["Event calendar", "Deposits & deadlines", "Per-head costs", "Vendor notes"],
    subtabs: ["Calendar", "Deposits", "Per-Head Costs"],
    today: {
      text: "Until Evie arrives: planned events live in Penny's budget with dates, attendance, and cost per person.",
      href: "/budget",
      label: "Open the budget",
    },
  },
];

export function getAgent(slug: string): AgentProfile | undefined {
  return AGENTS.find((a) => a.slug === slug);
}

/** The agent whose workspace the current path belongs to, if any. */
export function activeAgentFor(pathname: string): AgentProfile | undefined {
  return AGENTS.find((a) =>
    a.navTabs
      ? a.navTabs.some(
          (t) => pathname === t.href || pathname.startsWith(t.href + "/")
        )
      : pathname.startsWith(a.href)
  );
}
