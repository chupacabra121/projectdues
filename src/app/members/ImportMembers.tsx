"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Upload,
  X,
  FileSpreadsheet,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { importMembers, ImportMemberInput, ImportSummary } from "@/app/actions/members";
import {
  parseRosterFile,
  parseRosterText,
  ImportResult,
  ImportedMember,
} from "@/lib/importSpreadsheet";
import { MEMBER_STATUSES } from "@/lib/memberStatus";
import { inputCls } from "@/components/AuthShell";

const IMPORT_STATUSES = MEMBER_STATUSES.filter((s) => s.value !== "trash");
const FILE_ACCEPT = ".csv,.tsv,.txt,.xlsx,.xls";
const PREVIEW_COLS = "grid-cols-[1.4fr_1.7fr_1fr_5rem]";

const statusLabel = (v: string) =>
  MEMBER_STATUSES.find((s) => s.value === v)?.label ?? v;

/** Toolbar entry point — opens the import modal. */
export function ImportMembersButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Upload className="h-3.5 w-3.5" />
        Import
      </button>
      {open && <ImportModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"paste" | "file">("paste");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [status, setStatus] = useState("brother"); // "auto" or a status value
  const [error, setError] = useState("");
  const [done, setDone] = useState<ImportSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function applyResult(r: ImportResult | null) {
    setResult(r);
    setDone(null);
    setError("");
    // Keep parsed statuses ("auto") whenever the parse found any status signal —
    // a status column OR per-row pledge/active words. Otherwise default to Active.
    if (r) setStatus(r.statusColumn || r.pledgeCount > 0 ? "auto" : "brother");
  }

  function onText(v: string) {
    setText(v);
    applyResult(v.trim() ? parseRosterText(v) : null);
  }

  async function onFile(file?: File | null) {
    if (!file) return;
    setFileName(file.name);
    setDone(null);
    setError("");
    try {
      applyResult(await parseRosterFile(file));
    } catch {
      setResult(null);
      setError("Couldn't read that file — try a .csv or .xlsx export.");
    }
  }

  function runImport() {
    const members = result?.members ?? [];
    if (members.length === 0) return;
    const override = status === "auto" ? undefined : status;
    startTransition(async () => {
      setDone(await importMembers(members as ImportMemberInput[], override));
    });
  }

  const members = result?.members ?? [];
  const preview = members.slice(0, 8);
  const effStatus = (m: ImportedMember) => (status === "auto" ? m.status : status);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <button
        aria-label="Close import"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-background/70 backdrop-blur-sm"
      />
      <div className="glass-elevated relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-4">
          <div>
            <h2 className="font-display text-2xl text-foreground">Import members</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Paste a list, or upload a CSV / Excel file.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <SuccessState summary={done} onClose={onClose} />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Source toggle */}
              <div className="mb-4 inline-flex rounded-full border border-border bg-card p-0.5">
                <ModeTab
                  active={mode === "paste"}
                  onClick={() => setMode("paste")}
                  icon={ClipboardList}
                  label="Paste"
                />
                <ModeTab
                  active={mode === "file"}
                  onClick={() => setMode("file")}
                  icon={FileSpreadsheet}
                  label="Upload file"
                />
              </div>

              {mode === "paste" ? (
                <textarea
                  value={text}
                  onChange={(e) => onText(e.target.value)}
                  rows={6}
                  autoFocus
                  placeholder={
                    "Paste names — one per line — or rows like:\n" +
                    "John Smith, john@email.com, (555) 123-4567\n" +
                    "Jane Doe, jane@email.com, pledge"
                  }
                  className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
                />
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    onFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                    dragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">
                    {fileName || "Drop a file here, or click to browse"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    CSV, TSV, or Excel (.xlsx, .xls)
                  </p>
                  <input
                    type="file"
                    accept={FILE_ACCEPT}
                    className="hidden"
                    onChange={(e) => onFile(e.target.files?.[0])}
                  />
                </label>
              )}

              {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

              {result && members.length === 0 && !error && (
                <p className="mt-4 text-sm text-muted-foreground">
                  No members found in that {mode === "paste" ? "text" : "file"} yet.
                </p>
              )}

              {members.length > 0 && (
                <div className="mt-4 rounded-2xl border border-border bg-card/40 p-4">
                  {result && !result.statusColumn && (
                    <div className="mb-3 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-warning">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        No status column found — alumni and inactive rows can&apos;t be
                        picked out, so everyone imports with the status chosen below.
                        Use a sheet with a Status column, or edit statuses after import.
                      </span>
                    </div>
                  )}
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-foreground">
                      <span className="font-money font-semibold">{members.length}</span>{" "}
                      member{members.length === 1 ? "" : "s"} found
                      {result?.statusColumn && (
                        <span className="text-muted-foreground">
                          {" "}
                          · status from “{result.statusColumn}”
                        </span>
                      )}
                      {result && result.totalRows > members.length && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {result.totalRows - members.length} row
                          {result.totalRows - members.length === 1 ? "" : "s"} skipped
                        </span>
                      )}
                    </p>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Add as</span>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="rounded-lg border border-input bg-background px-2 py-1 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/40"
                      >
                        {result && (result.statusColumn || result.pledgeCount > 0) && (
                          <option value="auto">
                            {result.statusColumn ? "Detected" : "As written"} (
                            {result.activeCount} brother · {result.pledgeCount} pledge)
                          </option>
                        )}
                        {IMPORT_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.plural}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-border/60">
                    <div
                      className={`grid ${PREVIEW_COLS} gap-2 border-b border-border/60 bg-muted/40 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground`}
                    >
                      <span>Name</span>
                      <span>Email</span>
                      <span>Phone</span>
                      <span>Status</span>
                    </div>
                    <div className="divide-y divide-border/40">
                      {preview.map((m, i) => (
                        <div
                          key={i}
                          className={`grid ${PREVIEW_COLS} items-center gap-2 px-3 py-1.5 text-xs`}
                        >
                          <span className="truncate text-foreground">{m.name}</span>
                          <span className="truncate font-money text-muted-foreground">
                            {m.email || "—"}
                          </span>
                          <span className="truncate font-money text-muted-foreground">
                            {m.phone || "—"}
                          </span>
                          <span className="truncate text-accent-foreground">
                            {statusLabel(effStatus(m))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {members.length > preview.length && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      + {members.length - preview.length} more
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-4">
              <p className="hidden text-xs text-muted-foreground sm:block">
                Duplicates (same email or name) are skipped automatically.
              </p>
              <div className="flex w-full justify-end gap-2 sm:w-auto">
                <button
                  onClick={onClose}
                  className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={runImport}
                  disabled={members.length === 0 || isPending}
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {isPending
                    ? "Importing…"
                    : members.length
                      ? `Import ${members.length}`
                      : "Import"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Upload;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-primary/15 text-accent-foreground ring-1 ring-primary/30"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function SuccessState({
  summary,
  onClose,
}: {
  summary: ImportSummary;
  onClose: () => void;
}) {
  const notes = [
    summary.duplicates > 0 &&
      `${summary.duplicates} duplicate${summary.duplicates === 1 ? "" : "s"} skipped`,
    summary.skipped > 0 &&
      `${summary.skipped} blank row${summary.skipped === 1 ? "" : "s"} ignored`,
  ].filter(Boolean);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <CheckCircle2 className="h-10 w-10 text-money-up" />
      <p className="text-lg font-semibold text-foreground">
        Imported{" "}
        <span className="font-money text-money-up">{summary.imported}</span>{" "}
        member{summary.imported === 1 ? "" : "s"}
      </p>
      <p className="text-sm text-muted-foreground">
        {notes.length > 0 ? notes.join(" · ") : "Your roster is up to date."}
      </p>
      <button
        onClick={onClose}
        className="mt-2 rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Done
      </button>
    </div>
  );
}
