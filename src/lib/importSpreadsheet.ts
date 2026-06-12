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
  status: "active" | "pledge";
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

function rowsToResult(rows: Record<string, unknown>[]): ImportResult {
  const empty: ImportResult = {
    activeCount: 0,
    pledgeCount: 0,
    totalRows: 0,
    statusColumn: null,
    members: [],
    emailCount: 0,
    phoneCount: 0,
  };
  if (rows.length === 0) return empty;

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
      if (ACTIVE_RE.test(s)) status = "active";
      else if (PLEDGE_RE.test(s)) status = "pledge";
      else continue; // unrecognized status (alumni, inactive, …) — skip
    } else {
      status = "active"; // no status column: treat every row as active
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

  return {
    activeCount: members.filter((m) => m.status === "active").length,
    pledgeCount: members.filter((m) => m.status === "pledge").length,
    totalRows: rows.length,
    statusColumn: statusCol,
    members,
    emailCount: members.filter((m) => m.email).length,
    phoneCount: members.filter((m) => m.phone).length,
  };
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
