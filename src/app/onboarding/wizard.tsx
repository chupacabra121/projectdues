"use client";

import { useRef, useState, useTransition } from "react";
import { completeOnboarding } from "@/app/actions/setup";
import { parseRosterFile, ImportResult } from "@/lib/importSpreadsheet";
import { fmtUSD } from "@/lib/forecast";
import { Logo, inputCls, labelCls, primaryBtnCls } from "@/components/AuthShell";

type Step = "import" | "confirm" | "membership" | "dues";

const STEP_LABELS: Array<{ key: Step; label: string }> = [
  { key: "import", label: "Import" },
  { key: "membership", label: "Membership" },
  { key: "dues", label: "Dues & Forecast" },
];

export default function OnboardingWizard({ chapterName }: { chapterName: string }) {
  const [step, setStep] = useState<Step>("import");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");

  // Membership
  const [actives, setActives] = useState("");
  const [currentPledges, setCurrentPledges] = useState("");
  const [expectedPledges, setExpectedPledges] = useState("");

  // Dues
  const [activeDues, setActiveDues] = useState("");
  const [pledgeDues, setPledgeDues] = useState("");
  const [collectionRate, setCollectionRate] = useState("95");

  const [isPending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const stepIndex =
    step === "import" || step === "confirm"
      ? 0
      : step === "membership"
        ? 1
        : 2;

  async function handleFile(file: File) {
    setImportError("");
    try {
      const result = await parseRosterFile(file);
      if (result.totalRows === 0) {
        setImportError("That file appears to be empty. Try another file or start from scratch.");
        return;
      }
      setImportResult(result);
      setStep("confirm");
    } catch {
      setImportError("Couldn't read that file. Make sure it's a valid CSV or XLSX.");
    }
  }

  function confirmImport() {
    if (importResult) {
      setActives(String(importResult.activeCount));
      setCurrentPledges(String(importResult.pledgeCount));
    }
    setStep("membership");
  }

  const nActives = Math.max(0, parseInt(actives) || 0);
  const nExpected = Math.max(0, parseInt(expectedPledges) || 0);
  const dActive = Math.max(0, parseFloat(activeDues) || 0);
  const dPledge = Math.max(0, parseFloat(pledgeDues) || 0);
  const rate = Math.min(100, Math.max(0, parseFloat(collectionRate) || 0)) / 100;
  const projectedRevenue = (nActives * dActive + nExpected * dPledge) * rate;

  function finish() {
    startTransition(async () => {
      await completeOnboarding({
        activeMembers: nActives,
        currentPledges: Math.max(0, parseInt(currentPledges) || 0),
        pledgesConservative: Math.max(0, Math.round(nExpected * 0.67)),
        pledgesExpected: nExpected,
        pledgesOptimistic: Math.round(nExpected * 1.4),
        activeDues: dActive,
        pledgeDues: dPledge,
        collectionRate: rate * 100,
      });
    });
  }

  return (
    <main className="flex-1 px-4 py-10">
      <div className="max-w-xl mx-auto">
        <Logo className="justify-center mb-6" />
        <p className="text-center text-sm text-gray-500 mb-8">
          Setting up <span className="font-medium text-gray-700">{chapterName}</span>
        </p>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEP_LABELS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={`h-7 w-7 rounded-full grid place-items-center text-xs font-semibold ${
                  i < stepIndex
                    ? "bg-indigo-600 text-white"
                    : i === stepIndex
                      ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-sm ${i === stepIndex ? "font-medium text-gray-900" : "text-gray-400"}`}
              >
                {s.label}
              </span>
              {i < STEP_LABELS.length - 1 && (
                <div className="w-8 h-px bg-gray-300 mx-1" />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {step === "import" && (
            <div>
              <h1 className="text-xl font-semibold mb-1">Bring in your roster</h1>
              <p className="text-sm text-gray-500 mb-6">
                Import your member list, or start fresh — you can always add data later.
              </p>
              <div className="space-y-3">
                <button
                  disabled
                  className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-left opacity-60 cursor-not-allowed"
                >
                  <span className="font-medium text-sm">Import from Billhighway</span>
                  <span className="ml-2 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Coming soon</span>
                </button>
                <button
                  disabled
                  className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-left opacity-60 cursor-not-allowed"
                >
                  <span className="font-medium text-sm">Import from OmegaFi</span>
                  <span className="ml-2 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Coming soon</span>
                </button>
                <button
                  onClick={() => fileInput.current?.click()}
                  className="w-full rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-3.5 text-left hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                >
                  <span className="font-medium text-sm text-indigo-900">Upload Spreadsheet</span>
                  <p className="text-xs text-gray-500 mt-0.5">CSV or XLSX roster export</p>
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => setStep("membership")}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3.5 text-left hover:border-gray-400 transition-colors"
                >
                  <span className="font-medium text-sm">Start From Scratch</span>
                  <p className="text-xs text-gray-500 mt-0.5">Just enter a few numbers — no names needed</p>
                </button>
              </div>
              {importError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-4">{importError}</p>
              )}
            </div>
          )}

          {step === "confirm" && importResult && (
            <div>
              <h1 className="text-xl font-semibold mb-1">Here&apos;s what we found</h1>
              <p className="text-sm text-gray-500 mb-6">
                {importResult.statusColumn
                  ? `Detected member status from the “${importResult.statusColumn}” column.`
                  : "We couldn't find a status column, so we counted every row as an active member. You can adjust the numbers next."}
              </p>
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3.5">
                  <span className="text-sm font-medium text-emerald-900">Active Members</span>
                  <span className="text-lg font-semibold text-emerald-700">{importResult.activeCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-sky-50 border border-sky-200 px-4 py-3.5">
                  <span className="text-sm font-medium text-sky-900">Pledges</span>
                  <span className="text-lg font-semibold text-sky-700">{importResult.pledgeCount}</span>
                </div>
              </div>
              <button onClick={confirmImport} className={primaryBtnCls}>
                Confirm
              </button>
              <button
                onClick={() => setStep("import")}
                className="w-full text-sm text-gray-500 hover:text-gray-700 mt-3"
              >
                Try a different file
              </button>
            </div>
          )}

          {step === "membership" && (
            <div>
              <h1 className="text-xl font-semibold mb-1">Who&apos;s in the chapter?</h1>
              <p className="text-sm text-gray-500 mb-6">
                Rough numbers are fine — no names required.
              </p>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Number of Active Members</label>
                  <input
                    type="number" min={0} className={inputCls} placeholder="43"
                    value={actives} onChange={(e) => setActives(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Number of Current Pledges</label>
                  <input
                    type="number" min={0} className={inputCls} placeholder="0"
                    value={currentPledges} onChange={(e) => setCurrentPledges(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Expected New Pledges (this semester)</label>
                  <input
                    type="number" min={0} className={inputCls} placeholder="18"
                    value={expectedPledges} onChange={(e) => setExpectedPledges(e.target.value)}
                  />
                </div>
              </div>
              <button
                onClick={() => setStep("dues")}
                disabled={!actives}
                className={`${primaryBtnCls} mt-6`}
              >
                Continue
              </button>
            </div>
          )}

          {step === "dues" && (
            <div>
              <h1 className="text-xl font-semibold mb-1">Dues & collections</h1>
              <p className="text-sm text-gray-500 mb-6">
                Per-member dues for this semester. We&apos;ll forecast revenue as you type.
              </p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Active Member Dues</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number" min={0} className={`${inputCls} pl-7`} placeholder="650"
                        value={activeDues} onChange={(e) => setActiveDues(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Pledge Dues</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number" min={0} className={`${inputCls} pl-7`} placeholder="800"
                        value={pledgeDues} onChange={(e) => setPledgeDues(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Expected Collection Rate (%)</label>
                  <input
                    type="number" min={0} max={100} className={inputCls}
                    value={collectionRate} onChange={(e) => setCollectionRate(e.target.value)}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Most chapters collect 90–97% of billed dues.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-xl bg-indigo-600 text-white px-5 py-4">
                <p className="text-xs uppercase tracking-wide text-indigo-200">Projected Revenue</p>
                <p className="text-3xl font-semibold mt-1">{fmtUSD(projectedRevenue)}</p>
                <p className="text-xs text-indigo-200 mt-2">
                  ({nActives} actives × {fmtUSD(dActive)} + {nExpected} new pledges × {fmtUSD(dPledge)}) × {Math.round(rate * 100)}%
                </p>
              </div>

              <button
                onClick={finish}
                disabled={isPending || !activeDues}
                className={`${primaryBtnCls} mt-6`}
              >
                {isPending ? "Setting up…" : "Finish setup → Dashboard"}
              </button>
              <button
                onClick={() => setStep("membership")}
                className="w-full text-sm text-gray-500 hover:text-gray-700 mt-3"
              >
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
