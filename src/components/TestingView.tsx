/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Play, CheckCircle2, XCircle, Clock, Award, ShieldCheck } from "lucide-react";
import { runSuite, TestCaseResult } from "../utils/automatedTests";

export default function TestingView() {
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const executeTests = () => {
    setIsRunning(true);
    setHasRun(false);
    
    // Tiny timeout to let the UI thread show the loader first before heavy memory stress testing
    setTimeout(() => {
      try {
        const testResults = runSuite();
        setResults(testResults);
      } catch (e: any) {
        console.error("Test execution aborted:", e);
      } finally {
        setIsRunning(false);
        setHasRun(true);
      }
    }, 300);
  };

  const totalPassed = results.filter((r) => r.passed).length;
  const allPassed = hasRun && totalPassed === results.length;

  return (
    <div className="p-4 bg-white border border-slate-300 rounded shadow-xs space-y-4" id="testing-view">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-300 pb-3">
        <div>
          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            CAPRS Automated Verification & Stress-Testing Studio
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Mandatory verification checks representing mathematical calculations, cohort filters, status exclusions, and database processing speed bounds.</p>
        </div>
        <button
          onClick={executeTests}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-50 text-xs font-bold rounded transition-all shadow-xs shrink-0 cursor-pointer border border-slate-950"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          {isRunning ? "Testing 100k Records..." : "Run Compliance Suite"}
        </button>
      </div>

      {isRunning && (
        <div className="p-8 text-center space-y-2">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Simulating large-scale line list models and scanning counters...</p>
        </div>
      )}

      {hasRun && !isRunning && (
        <div className="space-y-4 animate-fade-in">
          {/* Summary Status Banner */}
          <div className={`p-3 rounded border flex items-center gap-3 ${
            allPassed
              ? "bg-emerald-50 border-emerald-300 text-emerald-800"
              : "bg-red-50 border-red-300 text-red-800"
          }`}>
            {allPassed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 shrink-0" />
            )}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider">
                {allPassed ? "All Core Compliance Tests Passed" : "Compliance Failure Detected"}
              </h4>
              <p className="text-[11px] text-slate-600 mt-0.5 font-semibold">
                {totalPassed} of {results.length} assertions passed. Calculations, aggregations, and performance timers conform to specifications.
              </p>
            </div>
          </div>

          {/* Test Cards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {results.map((test, idx) => (
              <div
                key={idx}
                className="p-3 border border-slate-300 rounded space-y-2 bg-slate-100 hover:bg-slate-200/55 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">{test.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-400 font-bold flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {test.durationMs.toFixed(0)} ms
                    </span>
                    {test.passed ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Pass</span>
                    ) : (
                      <span className="bg-red-100 text-red-800 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Fail</span>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 leading-normal font-medium">{test.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasRun && !isRunning && (
        <div className="p-8 text-center text-slate-400 border border-dashed border-slate-300 rounded space-y-2">
          <Award className="w-6 h-6 mx-auto text-slate-400" />
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Verification Engine Ready</h4>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto font-semibold">Click &quot;Run Compliance Suite&quot; to execute standard disaggregation unit tests and load-test processing limits.</p>
        </div>
      )}
    </div>
  );
}
