/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Brain, RefreshCw, AlertTriangle, CheckCircle, HelpCircle, FileText } from "lucide-react";
import { CCWCounter, AggregationNode, AINarrativeReport, ReportFilters } from "../types";

interface AINarrativesViewProps {
  ccwRecords: CCWCounter[];
  aggregations: {
    ccw: AggregationNode[];
    community: AggregationNode[];
    ward: AggregationNode[];
    lga: AggregationNode[];
    state: AggregationNode[];
    overall: AggregationNode;
  };
  filters: ReportFilters;
}

export default function AINarrativesView({
  ccwRecords,
  aggregations,
  filters
}: AINarrativesViewProps) {
  const [report, setReport] = useState<AINarrativeReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string>("");

  const steps = [
    "Assembling disaggregated program counters...",
    "Packaging clinical cohort indices (CALHIV, HEI)...",
    "Identifying high and low performing case worker rosters...",
    "Sending secure context to Gemini evaluator (gemini-3.5-flash)...",
    "Streaming evaluation narrative and drafting coordinator recommendations..."
  ];

  const fetchAIAnalysis = async () => {
    setIsLoading(true);
    setError("");
    setLoadingStep(0);

    // Stagger loading progress notes
    const timer = setInterval(() => {
      setLoadingStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1800);

    try {
      const overall = aggregations.overall;
      const sortedCcws = [...aggregations.ccw].sort((a, b) => b.Coverage - a.Coverage);
      const topCcws = sortedCcws.slice(0, 5).map(c => `${c.name} (${c.Coverage.toFixed(1)}% coverage)`);
      const bottomCcws = sortedCcws.filter(c => c.ActiveCMP > 0).slice(-5).map(c => `${c.name} (${c.Coverage.toFixed(1)}% coverage, Outstanding: ${c.Outstanding})`);

      const sortedLgas = [...aggregations.lga].sort((a, b) => b.Coverage - a.Coverage);
      const topLgas = sortedLgas.slice(0, 3).map(l => `${l.name} (${l.Coverage.toFixed(1)}%)`);
      const bottomLgas = sortedLgas.filter(l => l.ActiveCMP > 0).slice(-3).map(l => `${l.name} (${l.Coverage.toFixed(1)}% coverage, Outstanding: ${l.Outstanding})`);

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reportingPeriod: filters.ReportingPeriod,
          metrics: {
            ActiveCMP: overall.ActiveCMP,
            ActiveCALHIV: overall.ActiveCALHIV,
            ActiveHEI: overall.ActiveHEI,
            CALHIVServed: overall.CALHIVServed,
            HEIServed: overall.HEIServed,
            TotalServed: overall.TotalServed,
            Outstanding: overall.Outstanding,
            Coverage: overall.Coverage
          },
          topCcws,
          bottomCcws,
          topLgas,
          bottomLgas
        })
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || "Failed to contact analysis server.");
      }

      const parsedReport = await response.json();
      setReport(parsedReport);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "An unexpected error occurred during report evaluation.");
    } finally {
      clearInterval(timer);
      setIsLoading(false);
    }
  };

  // Load analysis once on mounting if not loaded
  useEffect(() => {
    if (!report && !isLoading && aggregations.overall.ActiveCMP > 0) {
      fetchAIAnalysis();
    }
  }, [aggregations.overall.ActiveCMP]);

  if (aggregations.overall.ActiveCMP === 0) {
    return (
      <div className="p-6 text-center bg-white border border-slate-300 rounded shadow-xs">
        <Brain className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">M&E Context Missing</h4>
        <p className="text-[11px] text-slate-500 mt-1">Please import a valid Child Monitor Plus (CMP) Line List first to compile narrative analysis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" id="ai-narratives-view">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-950 rounded shadow-sm">
        <div>
          <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Brain className="w-4 h-4 text-blue-400 animate-pulse" />
            Gemini Program M&E Narrative Reviewer
          </h3>
          <p className="text-[11px] text-slate-300 mt-0.5">Automated clinical analysis, program performance scoring, and follow-up guidance.</p>
        </div>
        <button
          onClick={fetchAIAnalysis}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 text-[11px] font-bold rounded border border-blue-700 transition-all shadow-sm shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Recalculate Brief
        </button>
      </div>

      {isLoading && (
        <div className="p-8 text-center bg-white border border-slate-300 rounded shadow-xs space-y-3">
          <div className="relative w-10 h-10 mx-auto">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">{steps[loadingStep]}</p>
          <p className="text-[11px] text-slate-500">Gemini is synthesizing performance logs for {aggregations.overall.ActiveCMP} beneficiaries...</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-300 rounded">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-[10px] font-bold text-red-800 uppercase tracking-widest">Narrative Generation Blocked</h4>
            <p className="text-[11px] text-red-700 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {report && !isLoading && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 animate-fade-in">
          {/* Main Evaluation Columns (2/3 width) */}
          <div className="xl:col-span-2 space-y-4">
            {/* Brief 1: Executive Summary */}
            <div className="p-4 bg-white border border-slate-300 rounded shadow-xs space-y-2">
              <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                <FileText className="w-3.5 h-3.5" />
                I. Program Executive Summary
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line font-medium">{report.executiveSummary}</p>
            </div>

            {/* Brief 2: Major Findings */}
            <div className="p-4 bg-white border border-slate-300 rounded shadow-xs space-y-2">
              <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                <FileText className="w-3.5 h-3.5" />
                II. Clinical Cohort Findings
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line font-medium">{report.majorFindings}</p>
            </div>

            {/* Brief 3: Outstanding Follow up */}
            <div className="p-4 bg-white border border-slate-300 rounded shadow-xs space-y-2">
              <h4 className="text-[10px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                <FileText className="w-3.5 h-3.5" />
                III. Backtracking & Loss-to-Follow-Up Action Plan
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line font-medium">{report.outstandingFollowUp}</p>
            </div>

            {/* Brief 4: Communities requiring intervention */}
            <div className="p-4 bg-white border border-slate-300 rounded shadow-xs space-y-2">
              <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                <FileText className="w-3.5 h-3.5" />
                IV. Target Communities Remediation Strategy
              </h4>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line font-medium">{report.communitiesIntervention}</p>
            </div>
          </div>

          {/* Sidebar Recommendations & Standings */}
          <div className="space-y-4">
            {/* Recommendations Panel */}
            <div className="p-4 bg-slate-100 border border-slate-300 rounded space-y-2">
              <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest border-b border-slate-200 pb-1">Clinical & Programmatic Recommendations</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line font-medium">{report.recommendations}</p>
            </div>

            {/* AI Evaluated Standings */}
            <div className="p-4 bg-white border border-slate-300 rounded shadow-xs space-y-3">
              <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest border-b border-slate-200 pb-1.5">Evaluated CCW Standings</h4>
              
              <div className="space-y-3">
                <div>
                  <span className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Top Performers Highlighted</span>
                  <ul className="list-disc list-inside text-[11px] text-slate-600 mt-1 space-y-0.5 font-medium">
                    {report.performanceAnalysis.highPerformingCCWs.map((ccw, idx) => (
                      <li key={idx} className="leading-normal">{ccw}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <span className="text-[9px] font-bold text-red-600 uppercase tracking-wider">Urgent Training / Review Roster</span>
                  <ul className="list-disc list-inside text-[11px] text-slate-600 mt-1 space-y-0.5 font-medium">
                    {report.performanceAnalysis.lowPerformingCCWs.map((ccw, idx) => (
                      <li key={idx} className="leading-normal">{ccw}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-300 rounded shadow-xs space-y-2">
              <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-widest border-b border-slate-200 pb-1.5">Conclusion</h4>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line font-medium">{report.conclusion}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
