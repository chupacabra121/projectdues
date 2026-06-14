/**
 * Membership categories — the one source of truth shared by the roster UI
 * (a client component), the server actions, and the DB row type. Kept in its
 * own module with no server-only imports so it's safe to pull into the client
 * bundle (importing from db.ts would drag better-sqlite3 into the browser).
 */

export type MemberStatus = "active" | "pledge" | "alumni" | "inactive";

export const MEMBER_STATUSES: {
  value: MemberStatus;
  label: string;
  plural: string;
}[] = [
  { value: "active", label: "Active", plural: "Actives" },
  { value: "pledge", label: "Pledge", plural: "Pledges" },
  { value: "alumni", label: "Alumni", plural: "Alumni" },
  { value: "inactive", label: "Inactive", plural: "Inactive" },
];
