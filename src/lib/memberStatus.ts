/**
 * Membership categories — the one source of truth shared by the roster UI
 * (a client component), the server actions, and the DB row type. Kept in its
 * own module with no server-only imports so it's safe to pull into the client
 * bundle (importing from db.ts would drag better-sqlite3 into the browser).
 */

export type MemberStatus =
  | "brother"
  | "pledge"
  | "alumni"
  | "inactive"
  | "trash";

/**
 * All categories in display order, including Trash (the soft-delete bin).
 * Trash is a real status but is excluded from the add-member dropdown and from
 * the "All" view — deleting a member moves them here instead of erasing them.
 */
export const MEMBER_STATUSES: {
  value: MemberStatus;
  label: string;
  plural: string;
}[] = [
  { value: "brother", label: "Brother", plural: "Brothers" },
  { value: "pledge", label: "Pledge", plural: "Pledges" },
  { value: "alumni", label: "Alumni", plural: "Alumni" },
  { value: "inactive", label: "Inactive", plural: "Inactive" },
  { value: "trash", label: "Trash", plural: "Trash" },
];

/**
 * "Actives" is a derived umbrella — everyone currently active in the chapter,
 * i.e. initiated Brothers plus uninitiated Pledges (as opposed to Alumni /
 * Inactive). It is NOT a stored status; compute it from these.
 */
export const ACTIVE_STATUSES: MemberStatus[] = ["brother", "pledge"];

export const isActiveMember = (s: MemberStatus): boolean =>
  s === "brother" || s === "pledge";
