/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Users,
  UserCheck,
  Percent,
  CheckCircle,
  AlertOctagon,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  ShieldCheck,
  ShieldX
} from "lucide-react";
import { CCWCounter, AggregationNode, ValidationResult, Beneficiary } from "../types";

interface DashboardViewProps {
  ccwRecords: CCWCounter[];
  aggregations: {
    ccw: AggregationNode[];
    community: AggregationNode[];
    ward: AggregationNode[];
    lga: AggregationNode[];
    state: AggregationNode[];
    overall: AggregationNode;
  };
  validation: ValidationResult;
  selectedPeriod: string;
  beneficiaries: Beneficiary[];
}

export default function DashboardView({
  ccwRecords,
  aggregations,
  validation,
  selectedPeriod,
  beneficiaries
}: DashboardViewProps) {
  const overall = aggregations.overall;
  const totalEnrolled = beneficiaries.length;

  // 1. Missing columns check
  const hasVCID = beneficiaries.some(b => b.VCUniqueID && b.VCUniqueID.trim() !== "");
  const hasName = beneficiaries.some(b => b.ChildName && b.ChildName.trim() !== "");
  const hasStatus = beneficiaries.some(b => b.OVCStatus && b.OVCStatus.trim() !== "");
  const hasStream = beneficiaries.some(b => b.EnrolmentStream && b.EnrolmentStream.trim() !== "");
  const hasState = beneficiaries.some(b => b.State && b.State.trim() !== "");
  const hasLGA = beneficiaries.some(b => b.LGA && b.LGA.trim() !== "");
  const hasWard = beneficiaries.some(b => b.Ward && b.Ward.trim() !== "");
  const hasCommunity = beneficiaries.some(b => b.Community && b.Community.trim() !== "");
  const hasCCW = beneficiaries.some(b => b.CCWName && b.CCWName.trim() !== "");

  const isMissingColumns = totalEnrolled > 0 && (!hasVCID || !hasName || !hasStatus || !hasStream || !hasState || !hasLGA || !hasWard || !hasCommunity || !hasCCW);

  // 2. Reporting Period check (no active records or no total served)
  const showNoRecordsMessage = totalEnrolled > 0 && !isMissingColumns && (overall.ActiveCMP === 0 || overall.TotalServed === 0);

  if (isMissingColumns) {
    return (
      <div className="p-8 text-center bg-red-50 border border-red-300 rounded space-y-3 shadow-xs" id="missing-columns-error">
        <AlertOctagon className="w-12 h-12 mx-auto text-red-600 animate-pulse" />
        <h3 className="text-sm font-bold uppercase text-red-800 tracking-wider">Line List Structure Invalid</h3>
        <p className="text-xs font-semibold text-red-600 max-w-md mx-auto leading-relaxed">
          The uploaded CMP Line List is missing one or more required columns.
        </p>
        <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
          Please verify that your Excel file contains headers for VC Unique ID, Child Name, OVC Status, Enrolment Stream, State, LGA, Ward, Community, and CCW Name.
        </p>
      </div>
    );
  }

  if (showNoRecordsMessage) {
    return (
      <div className="p-8 text-center bg-amber-50 border border-amber-300 rounded space-y-3 shadow-xs" id="no-records-error">
        <AlertOctagon className="w-12 h-12 mx-auto text-amber-600" />
        <h3 className="text-sm font-bold uppercase text-amber-800 tracking-wider">No Records In Period</h3>
        <p className="text-xs font-semibold text-amber-700 max-w-md mx-auto leading-relaxed">
          No beneficiary records were found for the selected reporting period.
        </p>
        <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
          Try selecting a different reporting period (e.g. quarterly or annual) or a wider custom date range in the global filters panel.
        </p>
      </div>
    );
  }

  // Determine top/bottom performers
  const sortedCcws = [...aggregations.ccw].sort((a, b) => b.Coverage - a.Coverage);
  const topCcws = sortedCcws.slice(0, 5);
  const bottomCcws = sortedCcws.filter(c => c.ActiveCMP > 0).slice(-5).reverse();

  const sortedLgas = [...aggregations.lga].sort((a, b) => b.Coverage - a.Coverage);
  const topLgas = sortedLgas.slice(0, 3);
  const bottomLgas = sortedLgas.filter(l => l.ActiveCMP > 0).slice(-3).reverse();

  return (
    <div className="space-y-4" id="dashboard-view">
      {/* Real-time Calculation Engine Debugger Panel */}
      <div className="p-4 bg-slate-900 text-white rounded border border-slate-800 shadow-sm" id="calculation-debugger">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Live M&E Calculation Debugger
            </h3>
          </div>
          <span className="text-[9px] bg-blue-600/30 border border-blue-500/40 text-blue-300 font-mono font-bold px-1.5 py-0.5 rounded uppercase">
            Normalization Active
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 text-center sm:text-left">
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Active CALHIV</span>
            <p className="text-lg font-extrabold text-white mt-1 font-mono">{overall.ActiveCALHIV.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Active HEI</span>
            <p className="text-lg font-extrabold text-white mt-1 font-mono">{overall.ActiveHEI.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">CALHIV Served</span>
            <p className="text-lg font-extrabold text-blue-400 mt-1 font-mono">{overall.CALHIVServed.toLocaleString()}</p>
          </div>
          <div>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">HEI Served</span>
            <p className="text-lg font-extrabold text-emerald-400 mt-1 font-mono">{overall.HEIServed.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Primary KPI Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 1: Active CMP */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Target (CMP)</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1">{overall.ActiveCMP.toLocaleString()}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Active OVC beneficiaries</p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-200">
            <Users className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 2: CALHIV Disaggregation */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">CALHIV / HEI Active</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1">
              {overall.ActiveCALHIV.toLocaleString()}<span className="text-slate-300 font-normal text-sm"> / </span>{overall.ActiveHEI.toLocaleString()}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Enrolled clinical cohorts</p>
          </div>
          <div className="p-2 bg-amber-50 text-amber-600 rounded border border-amber-200">
            <UserCheck className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 3: Total Served */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Served in Period</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1">{overall.TotalServed.toLocaleString()}</h3>
            <p className="text-[11px] text-blue-600 font-bold mt-0.5">
              CALHIV Served: {overall.CALHIVServed} | HEI Served: {overall.HEIServed}
            </p>
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded border border-emerald-200">
            <CheckCircle className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 4: Coverage Rate */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Overall Coverage</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1">{overall.Coverage.toFixed(1)}%</h3>
            <p className="text-[11px] text-red-600 font-bold mt-0.5">Outstanding: {overall.Outstanding.toLocaleString()}</p>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded border border-blue-200">
            <Percent className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Structural Metadata KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* KPI 5: Total Beneficiaries Enrolled */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Enrolled in DB</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1">{totalEnrolled.toLocaleString()}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Grand total loaded records</p>
          </div>
          <div className="p-2 bg-slate-50 text-slate-600 rounded border border-slate-300">
            <Users className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 6: LGAs */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active LGAs</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1">{aggregations.lga.length.toLocaleString()}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">LGAs in reporting dataset</p>
          </div>
          <div className="p-2 bg-slate-50 text-slate-600 rounded border border-slate-300">
            <ArrowUpRight className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 7: Communities */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Communities</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1">{aggregations.community.length.toLocaleString()}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Active service communities</p>
          </div>
          <div className="p-2 bg-slate-50 text-slate-600 rounded border border-slate-300">
            <ArrowUpRight className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 8: CCWs */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex items-start justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">CCW Personnel</span>
            <h3 className="text-xl font-bold text-slate-900 mt-1">{aggregations.ccw.length.toLocaleString()}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Active care workers deployed</p>
          </div>
          <div className="p-2 bg-slate-50 text-slate-600 rounded border border-slate-300">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Math Validator and Reporting Engine Guard */}
      <div className="p-4 bg-slate-100 border border-slate-300 rounded">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-300 pb-3">
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-800 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              M&E Engine Integrity Validator
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Real-time verification of sum aggregates and balance-sheet formulas.</p>
          </div>
          <div className={`flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold ${
            validation.isValid ? "bg-emerald-100 border border-emerald-300 text-emerald-800" : "bg-red-100 border border-red-300 text-red-800 animate-pulse"
          }`}>
            {validation.isValid ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                SYSTEM CODES VALID
              </>
            ) : (
              <>
                <ShieldX className="w-3.5 h-3.5" />
                MATHEMATICAL ERROR DETECTED
              </>
            )}
          </div>
        </div>

        {validation.isValid ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              <span className="text-[11px] font-medium text-slate-600">Disaggregation Rule Check: Passed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              <span className="text-[11px] font-medium text-slate-600">Outstanding Equation Balance: Passed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              <span className="text-[11px] font-medium text-slate-600">Coverage Boundary Logic: Passed</span>
            </div>
          </div>
        ) : (
          <div className="mt-3 p-2.5 bg-red-100 border border-red-300 rounded space-y-1">
            {validation.errors.map((err, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-[11px] text-red-700 font-medium">
                <AlertOctagon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rankings Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CCW Performance Standings */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <h3 className="font-bold uppercase text-slate-800 text-xs tracking-wider">CCW Coverage Rankings (Top & Bottom)</h3>
            <span className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded">Sorted by %</span>
          </div>

          <div className="space-y-4">
            {/* Top Performers */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1 mb-2">
                <ArrowUpRight className="w-3.5 h-3.5" />
                Top Performing CCWs
              </h4>
              <div className="space-y-1.5">
                {topCcws.length > 0 ? (
                  topCcws.map((c, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded transition-colors">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{c.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{c.childCount ? `${c.childCount} Communities` : "CCW Staff"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-slate-700">{c.Coverage.toFixed(1)}%</p>
                        <p className="text-[9px] text-slate-400">Served: {c.TotalServed} / {c.ActiveCMP}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">No active CCW records computed.</p>
                )}
              </div>
            </div>

            {/* Bottom Performers */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-red-500 flex items-center gap-1 mb-2">
                <ArrowDownRight className="w-3.5 h-3.5" />
                Underperforming CCWs (Action Required)
              </h4>
              <div className="space-y-1.5">
                {bottomCcws.length > 0 ? (
                  bottomCcws.map((c, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-red-50/40 border border-red-200 rounded transition-colors">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{c.name}</p>
                        <p className="text-[10px] text-red-600 font-medium truncate">Outstanding: {c.Outstanding}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-red-600">{c.Coverage.toFixed(1)}%</p>
                        <p className="text-[9px] text-slate-400 font-medium">Served: {c.TotalServed} / {c.ActiveCMP}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">No active underperforming CCWs.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* LGA Performance Standings */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <h3 className="font-bold uppercase text-slate-800 text-xs tracking-wider">LGA Coverage Standings</h3>
            <span className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded">Summary by LGA</span>
          </div>

          <div className="space-y-4">
            {/* Top LGAs */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1 mb-2">
                <ArrowUpRight className="w-3.5 h-3.5" />
                Highest Performing LGAs
              </h4>
              <div className="space-y-1.5">
                {topLgas.length > 0 ? (
                  topLgas.map((l, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded transition-colors">
                      <div>
                        <p className="text-xs font-bold text-slate-700">{l.name}</p>
                        <p className="text-[10px] text-slate-400">Total Active Targets: {l.ActiveCMP}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-slate-700">{l.Coverage.toFixed(1)}%</p>
                        <p className="text-[9px] text-slate-400">Outstanding: {l.Outstanding}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">No LGA records computed.</p>
                )}
              </div>
            </div>

            {/* Bottom LGAs */}
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-red-500 flex items-center gap-1 mb-2">
                <ArrowDownRight className="w-3.5 h-3.5" />
                Underperforming LGAs (Requires Review)
              </h4>
              <div className="space-y-1.5">
                {bottomLgas.length > 0 ? (
                  bottomLgas.map((l, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-red-50/40 border border-red-200 rounded transition-colors">
                      <div>
                        <p className="text-xs font-bold text-slate-700">{l.name}</p>
                        <p className="text-[10px] text-slate-400">Total Active Targets: {l.ActiveCMP}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-red-600">{l.Coverage.toFixed(1)}%</p>
                        <p className="text-[9px] text-slate-400 font-medium">Outstanding: {l.Outstanding}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">No underperforming LGAs.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
