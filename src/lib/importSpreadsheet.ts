/**
 * Client-side roster import. Parses CSV/XLSX, finds the columns that look
 * like status / name / email / phone, and extracts full member records so
 * the roster can power dues tracking and (later) mass reminders.
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ImportedMember {
  name: string;
  email: string;
  phone: string;
  status: "brother" | "pledge";
}

export interface ImportResult {
  activeCount: number;
  pledgeCount: number;
  totalRows: number;
  statusColumn: string | null; // null => couldn't detect, counts are a fallback
  members: ImportedMember[];
  emailCount: number;
  phoneCount: number;
}

const ACTIVE_RE = /^(active|act|brother|member|collegiate|initiate[d]?|senior|junior|sophomore|in\s?good\s?standing)/i;
const PLEDGE_RE = /^(pledge|new\s?member|nm|associate|candidate|pnm|probationary)/i;
const STATUS_HEADER_RE = /status|type|standing|role|class|level/i;

const NAME_HEADER_RE = /^(full\s?_?\s?name|name|member(\s?name)?)$/i;
const FIRST_NAME_RE = /first\s?_?\s?name|fname|^first$/i;
const LAST_NAME_RE = /last\s?_?\s?name|lname|surname|^last$/i;
const EMAIL_HEADER_RE = /e-?mail/i;
const PHONE_HEADER_RE = /phone|cell|mobile/i;

const EMAIL_VALUE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_VALUE_RE = /^[\d\s()+.\-]{7,}$/;

function val(row: Record<string, unknown>, col: string | null): string {
  if (!col) return "";
  return String(row[col] ?? "").trim();
}

/** Find a column by header pattern, falling back to majority value shape. */
function findColumn(
  rows: Record<string, unknown>[],
  columns: string[],
  headerRe: RegExp,
  valueRe?: RegExp
): string | null {
  const byHeader = columns.find((c) => headerRe.test(c));
  if (byHeader) return byHeader;
  if (!valueRe) return null;
  for (const col of columns) {
    let matches = 0;
    let nonEmpty = 0;
    for (const row of rows) {
      const v = val(row, col);
      if (!v) continue;
      nonEmpty++;
      if (valueRe.test(v)) matches++;
    }
    if (nonEmpty > 0 && matches / nonEmpty >= 0.5) return col;
  }
  return null;
}

function findStatusColumn(
  rows: Record<string, unknown>[],
  columns: string[]
): string | null {
  let best: { col: string; score: number } | null = null;
  for (const col of columns) {
    let matched = 0;
    let nonEmpty = 0;
    for (const row of rows) {
      const v = val(row, col);
      if (!v) continue;
      nonEmpty++;
      if (ACTIVE_RE.test(v) || PLEDGE_RE.test(v)) matched++;
    }
    if (nonEmpty === 0) continue;
    const matchRate = matched / nonEmpty;
    if (matchRate < 0.5) continue;
    // Prefer columns whose header looks like a status field over columns
    // whose values merely happen to match (e.g. a name like "Brother Bob").
    const score = matchRate + (STATUS_HEADER_RE.test(col) ? 1 : 0);
    if (!best || score > best.score) best = { col, score };
  }
  return best?.col ?? null;
}

/** Roll a list of parsed members into the summary shape the UI expects. */
function aggregate(
  members: ImportedMember[],
  totalRows: number,
  statusColumn: string | null
): ImportResult {
  return {
    activeCount: members.filter((m) => m.status === "brother").length,
    pledgeCount: members.filter((m) => m.status === "pledge").length,
    totalRows,
    statusColumn,
    members,
    emailCount: members.filter((m) => m.email).length,
    phoneCount: members.filter((m) => m.phone).length,
  };
}

function rowsToResult(rows: Record<string, unknown>[]): ImportResult {
  if (rows.length === 0) return aggregate([], 0, null);

  const columns = Object.keys(rows[0]);
  const statusCol = findStatusColumn(rows, columns);
  const nameCol = columns.find((c) => NAME_HEADER_RE.test(c)) ?? null;
  const firstCol = columns.find((c) => FIRST_NAME_RE.test(c)) ?? null;
  const lastCol = columns.find((c) => LAST_NAME_RE.test(c)) ?? null;
  const emailCol = findColumn(rows, columns, EMAIL_HEADER_RE, EMAIL_VALUE_RE);
  const phoneCol = findColumn(rows, columns, PHONE_HEADER_RE, PHONE_VALUE_RE);

  const members: ImportedMember[] = [];
  for (const [i, row] of rows.entries()) {
    let status: ImportedMember["status"];
    if (statusCol) {
      const s = val(row, statusCol);
      if (ACTIVE_RE.test(s)) status = "brother";
      else if (PLEDGE_RE.test(s)) status = "pledge";
      else continue; // unrecognized status (alumni, inactive, …) — skip
    } else {
      status = "brother"; // no status column: treat every row as a brother
    }

    const email = val(row, emailCol);
    let name = nameCol
      ? val(row, nameCol)
      : [val(row, firstCol), val(row, lastCol)].filter(Boolean).join(" ");
    if (!name) name = email ? email.split("@")[0] : `Member ${i + 1}`;

    members.push({
      name,
      email: EMAIL_VALUE_RE.test(email) ? email : "",
      phone: val(row, phoneCol),
      status,
    });
  }

  return aggregate(members, rows.length, statusCol);
}

/** Any header keyword — used to tell a header row from a data row when pasting. */
const HEADER_ANY_RE = /name|e-?mail|phone|cell|mobile|status|first|last|surname|member|standing/i;

/**
 * Classify one delimited row when there's no header to map against. The name is
 * the leading text cells (before any email/phone); a status word is honored
 * whether it leads or trails; and any *trailing* extra columns (birthday,
 * location, notes, …) are ignored so they never get mashed into the name.
 */
function classifyRow(rawCells: string[], i: number): ImportedMember | null {
  const vals = rawCells.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (vals.length === 0) return null;

  let email = "";
  let phone = "";
  let status: ImportedMember["status"] = "brother";
  let statusSet = false;
  const lead: string[] = []; // text cells before the first contact field = name
  let sawContact = false;

  for (const v of vals) {
    if (!email && EMAIL_VALUE_RE.test(v)) {
      email = v;
      sawContact = true;
    } else if (!phone && PHONE_VALUE_RE.test(v)) {
      phone = v;
      sawContact = true;
    } else if (!statusSet && sawContact && (ACTIVE_RE.test(v) || PLEDGE_RE.test(v))) {
      // a status word after the contact fields, e.g. "Jane, jane@x.com, pledge"
      status = PLEDGE_RE.test(v) ? "pledge" : "brother";
      statusSet = true;
    } else if (!sawContact) {
      lead.push(v);
    }
    // a trailing non-status extra column is intentionally dropped
  }

  // A leading status word ("Active, Bob, bob@x.com"), but never the only cell —
  // so a name like "Brother Bob" isn't mistaken for a status.
  let nameParts = lead;
  if (!statusSet && lead.length > 1) {
    const idx = lead.findIndex((v) => ACTIVE_RE.test(v) || PLEDGE_RE.test(v));
    if (idx >= 0) {
      status = PLEDGE_RE.test(lead[idx]) ? "pledge" : "brother";
      nameParts = lead.filter((_, k) => k !== idx);
    }
  }

  let name = nameParts.join(" ").trim();
  if (!name) name = email ? email.split("@")[0] : `Member ${i + 1}`;
  return { name, email, phone, status };
}

/**
 * Parse pasted text — a column of names, comma/tab rows, or a copy out of
 * Excel, with or without a header line. Mirrors parseRosterFile's output.
 */
export function parseRosterText(text: string): ImportResult {
  const t = text.trim();
  if (!t) return aggregate([], 0, null);

  const grid = (Papa.parse<string[]>(t, { skipEmptyLines: "greedy" }).data || [])
    .map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : []))
    .filter((r) => r.some(Boolean));
  if (grid.length === 0) return aggregate([], 0, null);

  // A header row has field names and no actual email/phone values in it.
  const first = grid[0];
  const looksHeader =
    first.some((c) => HEADER_ANY_RE.test(c)) &&
    !first.some((c) => EMAIL_VALUE_RE.test(c) || PHONE_VALUE_RE.test(c));

  if (looksHeader) {
    const parsed = Papa.parse<Record<string, unknown>>(t, {
      header: true,
      skipEmptyLines: "greedy",
    });
    return rowsToResult(parsed.data);
  }

  const members: ImportedMember[] = [];
  grid.slice(0, 5000).forEach((cells, i) => {
    const m = classifyRow(cells, i);
    if (m) members.push(m);
  });
  return aggregate(members, grid.length, null);
}

export async function parseRosterFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
    return rowsToResult(rows);
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return rowsToResult(parsed.data);
}
