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
  image: string;
  /** Short line under the name on the avatar strip and cards. */
  tagline: string;
  description: string;
  focus: string[];
  subtabs: string[];
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
    image: "/agents/penny.jpg",
    tagline: "Can we afford it?",
    description:
      "Penny watches money in and money out, keeps the semester forecast live, and answers the only question that matters: can we afford what we're planning?",
    focus: ["Semester plan", "Plan vs actual", "Member dues", "Recruitment scenarios"],
    subtabs: ["Dashboard", "Budget", "Plan vs Actual", "Members", "Scenarios"],
  },
  {
    slug: "dues-collection",
    href: "/agents/dues-collection",
    name: "Dunn",
    role: "Dues Collection",
    status: "soon",
    image: "/agents/dunn.jpg",
    tagline: "Politely relentless.",
    description:
      "Dunn will send dues reminders by email and text, escalate gently when payments slip, and report what's been collected — built on the member roster Penny already keeps.",
    focus: ["Email reminders", "SMS reminders", "Escalation ladder", "Collections report"],
    subtabs: ["Reminders", "Escalations", "Collections"],
    today: {
      text: "Until Dunn arrives: filter the roster to unpaid members and copy their emails or phone numbers in one click.",
      href: "/members",
      label: "Open the roster",
    },
  },
  {
    slug: "recruitment",
    href: "/agents/recruitment",
    name: "Russ",
    role: "Recruitment",
    status: "soon",
    image: "/agents/russ.jpg",
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
    image: "/agents/evie.jpg",
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
