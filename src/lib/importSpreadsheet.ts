/**
 * Client-side roster import. Parses CSV/XLSX, finds the column that looks
 * like a member-status column, and counts actives vs pledges.
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ImportResult {
  activeCount: number;
  pledgeCount: number;
  totalRows: number;
  statusColumn: string | null; // null => couldn't detect, counts are a fallback
}

const ACTIVE_RE = /^(active|act|brother|member|collegiate|initiate[d]?|senior|junior|sophomore|in\s?good\s?standing)/i;
const PLEDGE_RE = /^(pledge|new\s?member|nm|associate|candidate|pnm|probationary)/i;
const STATUS_HEADER_RE = /status|type|standing|role|class|level/i;

function rowsToResult(rows: Record<string, unknown>[]): ImportResult {
  const total = rows.length;
  if (total === 0)
    return { activeCount: 0, pledgeCount: 0, totalRows: 0, statusColumn: null };

  const columns = Object.keys(rows[0]);
  let best: { col: string; active: number; pledge: number; score: number } | null =
    null;

  for (const col of columns) {
    let active = 0;
    let pledge = 0;
    let nonEmpty = 0;
    for (const row of rows) {
      const v = String(row[col] ?? "").trim();
      if (!v) continue;
      nonEmpty++;
      if (ACTIVE_RE.test(v)) active++;
      else if (PLEDGE_RE.test(v)) pledge++;
    }
    if (nonEmpty === 0) continue;
    const matchRate = (active + pledge) / nonEmpty;
    if (matchRate < 0.5) continue;
    // Prefer columns whose header looks like a status field over columns
    // whose values merely happen to match (e.g. a name like "Brother Bob").
    const score = matchRate + (STATUS_HEADER_RE.test(col) ? 1 : 0);
    if (!best || score > best.score) {
      best = { col, active, pledge, score };
    }
  }

  if (best) {
    return {
      activeCount: best.active,
      pledgeCount: best.pledge,
      totalRows: total,
      statusColumn: best.col,
    };
  }
  // No status column found — treat every row as an active member.
  return { activeCount: total, pledgeCount: 0, totalRows: total, statusColumn: null };
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
