/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
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
  ShieldX,
  LayoutDashboard,
  Heart,
  Scale,
  Sparkles,
  Info,
  AlertTriangle
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { CCWCounter, AggregationNode, ValidationResult, Beneficiary, ReportFilters } from "../types";
import { passesFilters, parseDate } from "../utils/reportingEngine";
import NutritionDashboard, { getNutritionCategory } from "./NutritionDashboard";
import TuberculosisDashboard, {
  isScreened,
  isPresumptive,
  isConfirmed,
  isStartedTPT,
  isCompletedTPT
} from "./TuberculosisDashboard";
import ClinicalDrilldownModal from "./ClinicalDrilldownModal";
import IITDashboard from "./IITDashboard";
import NewlyEnrolledDashboard from "./NewlyEnrolledDashboard";
import ClinicalAlertsDashboard from "./ClinicalAlertsDashboard";
import { calculateClinicalAlerts } from "../utils/clinicalAlertsEngine";

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
  filters: ReportFilters;
  targetDate: Date;
}

export default function DashboardView({
  ccwRecords,
  aggregations,
  validation,
  selectedPeriod,
  beneficiaries,
  filters,
  targetDate
}: DashboardViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<"overview" | "nutrition" | "tuberculosis" | "iit" | "newly_enrolled" | "alerts">("overview");

  // Drilldown Modal State
  const [drilldown, setDrilldown] = useState<{
    isOpen: boolean;
    title: string;
    type:
      | "nutrition"
      | "tb"
      | "general"
      | "no_bmi"
      | "viral_load_sample"
      | "viral_load_result"
      | "viral_load_date"
      | "unsuppressed"
      | "drug_pickup"
      | "appointment"
      | "iit"
      | "sam"
      | "mam"
      | "presumptive_tb";
    list: Beneficiary[];
  } | null>(null);

  const overall = aggregations.overall;
  const totalEnrolled = beneficiaries.length;

  // 1. Missing columns check
  const hasVCID = beneficiaries.some((b) => b.VCUniqueID && b.VCUniqueID.trim() !== "");
  const hasName = beneficiaries.some((b) => b.ChildName && b.ChildName.trim() !== "");
  const hasStatus = beneficiaries.some((b) => b.OVCStatus && b.OVCStatus.trim() !== "");
  const hasStream = beneficiaries.some((b) => b.EnrolmentStream && b.EnrolmentStream.trim() !== "");
  const hasState = beneficiaries.some((b) => b.State && b.State.trim() !== "");
  const hasLGA = beneficiaries.some((b) => b.LGA && b.LGA.trim() !== "");
  const hasWard = beneficiaries.some((b) => b.Ward && b.Ward.trim() !== "");
  const hasCommunity = beneficiaries.some((b) => b.Community && b.Community.trim() !== "");
  const hasCCW = beneficiaries.some((b) => b.CCWName && b.CCWName.trim() !== "");

  const isMissingColumns =
    totalEnrolled > 0 &&
    (!hasVCID ||
      !hasName ||
      !hasStatus ||
      !hasStream ||
      !hasState ||
      !hasLGA ||
      !hasWard ||
      !hasCommunity ||
      !hasCCW);

  // 2. Reporting Period check (no active records or no total served)
  const showNoRecordsMessage =
    totalEnrolled > 0 && !isMissingColumns && (overall.ActiveCMP === 0 || overall.TotalServed === 0);

  // 3. Filtered beneficiaries based on active global filters
  const filteredBeneficiaries = useMemo(() => {
    return beneficiaries.filter((b) => passesFilters(b, filters));
  }, [beneficiaries, filters]);

  // Compute active clinical counts
  const clinicalLists = useMemo(() => {
    const sam = filteredBeneficiaries.filter((b) => getNutritionCategory(b) === "SAM");
    const mam = filteredBeneficiaries.filter((b) => getNutritionCategory(b) === "MAM");
    const presumptive = filteredBeneficiaries.filter(isPresumptive);
    const confirmed = filteredBeneficiaries.filter(isConfirmed);
    const tptCompleted = filteredBeneficiaries.filter(isCompletedTPT);

    // Alert lists
    const missingNutrition = filteredBeneficiaries.filter((b) => getNutritionCategory(b) === "UNKNOWN");
    const presumptiveNoDiag = filteredBeneficiaries.filter((b) => isPresumptive(b) && !isConfirmed(b));
    const confirmedNoTpt = filteredBeneficiaries.filter((b) => isConfirmed(b) && !isStartedTPT(b));
    const tptStartedNotCompleted = filteredBeneficiaries.filter((b) => isStartedTPT(b) && !isCompletedTPT(b));

    const totalActiveOvc = filteredBeneficiaries.length;
    const screenedCount = filteredBeneficiaries.filter(isScreened).length;
    const tbScreeningCoverage = totalActiveOvc > 0 ? (screenedCount / totalActiveOvc) * 100 : 0;

    return {
      sam,
      mam,
      presumptive,
      confirmed,
      tptCompleted,
      missingNutrition,
      presumptiveNoDiag,
      confirmedNoTpt,
      tptStartedNotCompleted,
      tbScreeningCoverage,
      screenedCount
    };
  }, [filteredBeneficiaries]);

  // Compute Nutrition Improvement Trend Data for Sparkline
  const nutritionTrendSparkline = useMemo(() => {
    const map = new Map<string, { month: string; rawDate: Date; Normal: number; Total: number }>();
    filteredBeneficiaries.forEach((b) => {
      const date = parseDate(b.DateOfLatestServiceProvided);
      if (!date) return;
      const mStr = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
      
      if (!map.has(mStr)) {
        map.set(mStr, { month: mStr, rawDate: startOfMonth, Normal: 0, Total: 0 });
      }
      const cat = getNutritionCategory(b);
      const entry = map.get(mStr)!;
      if (cat !== "UNKNOWN") {
        entry.Total++;
        if (cat === "NORMAL") {
          entry.Normal++;
        }
      }
    });

    return Array.from(map.values())
      .map((entry) => ({
        month: entry.month,
        rawDate: entry.rawDate,
        "Normal Rate (%)": entry.Total > 0 ? parseFloat(((entry.Normal / entry.Total) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
  }, [filteredBeneficiaries]);

  // Handle drilling down
  const handleDrilldown = (
    title: string,
    list: Beneficiary[],
    type:
      | "nutrition"
      | "tb"
      | "general"
      | "no_bmi"
      | "viral_load_sample"
      | "viral_load_result"
      | "viral_load_date"
      | "unsuppressed"
      | "drug_pickup"
      | "appointment"
      | "iit"
      | "sam"
      | "mam"
      | "presumptive_tb"
  ) => {
    setDrilldown({
      isOpen: true,
      title,
      type,
      list
    });
  };

  const iitThreshold = useMemo(() => {
    const saved = localStorage.getItem("caprs_iit_threshold_days");
    return saved ? parseInt(saved, 10) : 28;
  }, []);

  const alertsSummary = useMemo(() => {
    return calculateClinicalAlerts(filteredBeneficiaries, filters, targetDate, iitThreshold).summary;
  }, [filteredBeneficiaries, filters, targetDate, iitThreshold]);

  if (isMissingColumns) {
    return (
      <div
        className="p-8 text-center bg-red-50 border border-red-300 rounded space-y-3 shadow-xs"
        id="missing-columns-error"
      >
        <AlertOctagon className="w-12 h-12 mx-auto text-red-600 animate-pulse" />
        <h3 className="text-sm font-bold uppercase text-red-800 tracking-wider">Line List Structure Invalid</h3>
        <p className="text-xs font-semibold text-red-600 max-w-md mx-auto leading-relaxed">
          The uploaded CMP Line List is missing one or more required columns.
        </p>
        <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
          Please verify that your Excel file contains headers for VC Unique ID, Child Name, OVC Status, Enrolment
          Stream, State, LGA, Ward, Community, and CCW Name.
        </p>
      </div>
    );
  }

  if (showNoRecordsMessage) {
    return (
      <div
        className="p-8 text-center bg-amber-50 border border-amber-300 rounded space-y-3 shadow-xs"
        id="no-records-error"
      >
        <AlertOctagon className="w-12 h-12 mx-auto text-amber-600" />
        <h3 className="text-sm font-bold uppercase text-amber-800 tracking-wider">No Records In Period</h3>
        <p className="text-xs font-semibold text-amber-700 max-w-md mx-auto leading-relaxed">
          No beneficiary records were found for the selected reporting period.
        </p>
        <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
          Try selecting a different reporting period (e.g. quarterly or annual) or a wider custom date range in the
          global filters panel.
        </p>
      </div>
    );
  }

  // CCW / LGA ranks
  const sortedCcws = [...aggregations.ccw].sort((a, b) => b.Coverage - a.Coverage);
  const topCcws = sortedCcws.slice(0, 5);
  const bottomCcws = sortedCcws.filter((c) => c.ActiveCMP > 0).slice(-5).reverse();

  const sortedLgas = [...aggregations.lga].sort((a, b) => b.Coverage - a.Coverage);
  const topLgas = sortedLgas.slice(0, 3);
  const bottomLgas = sortedLgas.filter((l) => l.ActiveCMP > 0).slice(-3).reverse();

  return (
    <div className="space-y-6" id="dashboard-view-root">
      
      {/* Sub navigation bar for Clinical Cohorts */}
      <div className="flex flex-wrap border-b border-slate-200 bg-white p-1 rounded-t shadow-xs gap-1.5" id="clinical-sub-tabs">
        <button
          onClick={() => setActiveSubTab("overview")}
          className={`flex items-center gap-2 font-bold uppercase text-xs px-4 py-2.5 rounded transition-all cursor-pointer ${
            activeSubTab === "overview"
              ? "bg-slate-900 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <LayoutDashboard className="w-4 h-4 text-emerald-400" />
          Overview & Priorities
        </button>
        <button
          onClick={() => setActiveSubTab("nutrition")}
          className={`flex items-center gap-2 font-bold uppercase text-xs px-4 py-2.5 rounded transition-all cursor-pointer ${
            activeSubTab === "nutrition"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Scale className="w-4 h-4 text-amber-400" />
          Nutrition Assessment
        </button>
        <button
          onClick={() => setActiveSubTab("tuberculosis")}
          className={`flex items-center gap-2 font-bold uppercase text-xs px-4 py-2.5 rounded transition-all cursor-pointer ${
            activeSubTab === "tuberculosis"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Heart className="w-4 h-4 text-rose-400 animate-pulse" />
          Tuberculosis Monitoring
        </button>
        <button
          onClick={() => setActiveSubTab("iit")}
          className={`flex items-center gap-2 font-bold uppercase text-xs px-4 py-2.5 rounded transition-all cursor-pointer ${
            activeSubTab === "iit"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
          IIT (Interruption)
        </button>
        <button
          onClick={() => setActiveSubTab("newly_enrolled")}
          className={`flex items-center gap-2 font-bold uppercase text-xs px-4 py-2.5 rounded transition-all cursor-pointer ${
            activeSubTab === "newly_enrolled"
              ? "bg-blue-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <Users className="w-4 h-4 text-sky-400" />
          Newly Enrolled
        </button>
        <button
          onClick={() => setActiveSubTab("alerts")}
          className={`flex items-center gap-2 font-bold uppercase text-xs px-4 py-2.5 rounded transition-all cursor-pointer ${
            activeSubTab === "alerts"
              ? "bg-rose-600 text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          <AlertOctagon className="w-4 h-4 text-white" />
          Clinical Alerts & Data Quality
        </button>
      </div>

      {/* Render selected Dashboard Tab */}
      {activeSubTab === "nutrition" && (
        <NutritionDashboard
          filteredBeneficiaries={filteredBeneficiaries}
          onDrilldown={handleDrilldown}
          filters={filters}
          targetDate={targetDate}
        />
      )}

      {activeSubTab === "tuberculosis" && (
        <TuberculosisDashboard
          filteredBeneficiaries={filteredBeneficiaries}
          onDrilldown={handleDrilldown}
          filters={filters}
          targetDate={targetDate}
        />
      )}

      {activeSubTab === "iit" && (
        <IITDashboard
          filteredBeneficiaries={filteredBeneficiaries}
          filters={filters}
          targetDate={targetDate}
          onDrilldown={handleDrilldown}
        />
      )}

      {activeSubTab === "newly_enrolled" && (
        <NewlyEnrolledDashboard
          filteredBeneficiaries={filteredBeneficiaries}
          filters={filters}
          targetDate={targetDate}
          onDrilldown={handleDrilldown}
        />
      )}

      {activeSubTab === "alerts" && (
        <ClinicalAlertsDashboard
          filteredBeneficiaries={filteredBeneficiaries}
          filters={filters}
          targetDate={targetDate}
          onDrilldown={handleDrilldown}
        />
      )}

      {activeSubTab === "overview" && (
        <div className="space-y-6" id="overview-and-priorities-panel">
          
          {/* Real-time Calculation Engine Debugger Panel */}
          <div className="p-4 bg-slate-900 text-white rounded border border-slate-800 shadow-sm animate-fade-in" id="calculation-debugger">
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

          {/* Clinical Priorities Section (Management Dashboard) */}
          <div className="p-5 bg-white border border-slate-300 rounded shadow-xs space-y-4" id="clinical-priorities">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold uppercase text-slate-800 text-xs tracking-wider">
                  Clinical Priorities (Management Overview)
                </h3>
              </div>
              <span className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 font-bold px-2.5 py-0.5 rounded flex items-center gap-1">
                <Info className="w-3 h-3 text-blue-500" /> Click to Drill Down
              </span>
            </div>

            {/* Grid of Priorities */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              
              {/* SAM Cases card */}
              <div
                onClick={() => handleDrilldown("SAM Cases Requiring Urgent Action", clinicalLists.sam, "nutrition")}
                className="p-4 bg-rose-50 hover:bg-rose-100/60 border border-rose-300 rounded shadow-xs cursor-pointer hover:shadow-md transition-all text-center flex flex-col justify-between"
              >
                <span className="text-[9px] font-bold text-rose-800 uppercase tracking-wider block">SAM Cases</span>
                <h3 className="text-2xl font-extrabold text-rose-700 mt-1.5">{clinicalLists.sam.length}</h3>
                <span className="text-[9px] text-rose-500 font-semibold mt-1 block">🔴 Urgent Care link</span>
              </div>

              {/* MAM Cases card */}
              <div
                onClick={() => handleDrilldown("MAM Cases Requiring Nutrition Support", clinicalLists.mam, "nutrition")}
                className="p-4 bg-orange-50 hover:bg-orange-100/60 border border-orange-300 rounded shadow-xs cursor-pointer hover:shadow-md transition-all text-center flex flex-col justify-between"
              >
                <span className="text-[9px] font-bold text-orange-800 uppercase tracking-wider block">MAM Cases</span>
                <h3 className="text-2xl font-bold text-orange-600 mt-1.5">{clinicalLists.mam.length}</h3>
                <span className="text-[9px] text-orange-500 font-semibold mt-1 block">🟠 Support link</span>
              </div>

              {/* Presumptive TB */}
              <div
                onClick={() => handleDrilldown("Presumptive TB Cases Awaiting Diagnosis", clinicalLists.presumptive, "tb")}
                className="p-4 bg-amber-50 hover:bg-amber-100/60 border border-amber-300 rounded shadow-xs cursor-pointer hover:shadow-md transition-all text-center flex flex-col justify-between"
              >
                <span className="text-[9px] font-bold text-amber-800 uppercase tracking-wider block">Presumptive TB</span>
                <h3 className="text-2xl font-bold text-amber-600 mt-1.5">{clinicalLists.presumptive.length}</h3>
                <span className="text-[9px] text-amber-500 font-semibold mt-1 block">🔴 Diagnosis link</span>
              </div>

              {/* TB Confirmed */}
              <div
                onClick={() => handleDrilldown("Confirmed TB Cases Awaiting Treatment / TPT", clinicalLists.confirmed, "tb")}
                className="p-4 bg-rose-50 hover:bg-rose-100/60 border border-rose-300 rounded shadow-xs cursor-pointer hover:shadow-md transition-all text-center flex flex-col justify-between"
              >
                <span className="text-[9px] font-bold text-rose-800 uppercase tracking-wider block">TB Confirmed</span>
                <h3 className="text-2xl font-extrabold text-rose-700 mt-1.5">{clinicalLists.confirmed.length}</h3>
                <span className="text-[9px] text-rose-500 font-semibold mt-1 block">🔴 Immediate link</span>
              </div>

              {/* TPT Completed */}
              <div
                onClick={() => handleDrilldown("TPT Prophylaxis Completed Course", clinicalLists.tptCompleted, "tb")}
                className="p-4 bg-emerald-50 hover:bg-emerald-100/60 border border-emerald-300 rounded shadow-xs cursor-pointer hover:shadow-md transition-all text-center flex flex-col justify-between hover:border-emerald-500"
              >
                <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-wider block">TPT Completed</span>
                <h3 className="text-2xl font-bold text-emerald-600 mt-1.5">{clinicalLists.tptCompleted.length}</h3>
                <span className="text-[9px] text-emerald-500 font-semibold mt-1 block">🟢 Protected list</span>
              </div>

            </div>

            {/* Bottom Section of Priorities (Trend Sparkline & Coverage Progress Bar) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* TB Screening Coverage */}
              <div
                onClick={() => handleDrilldown("TB Screened Beneficiaries Coverage", filteredBeneficiaries.filter(isScreened), "tb")}
                className="p-4 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between cursor-pointer hover:border-blue-500 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">TB Screening Coverage</span>
                    <span className="text-xs font-bold text-slate-800">{clinicalLists.tbScreeningCoverage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full mt-2 relative overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${clinicalLists.tbScreeningCoverage}%` }}
                    ></div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 text-[10px] text-slate-400 font-semibold">
                  <span>Screened: {clinicalLists.screenedCount} / {filteredBeneficiaries.length} active children</span>
                  <span className="text-blue-600 font-bold hover:underline">View screened list</span>
                </div>
              </div>

              {/* Nutrition Improvement Trend Sparkline */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nutrition Improvement Trend</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded font-mono">
                    {nutritionTrendSparkline.length > 0
                      ? `${nutritionTrendSparkline[nutritionTrendSparkline.length - 1]["Normal Rate (%)"]}% Normal`
                      : "0%"}
                  </span>
                </div>
                <div className="h-10 w-full">
                  {nutritionTrendSparkline.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={nutritionTrendSparkline}>
                        <Tooltip contentStyle={{ fontSize: "10px", padding: "4px" }} />
                        <Line
                          type="monotone"
                          dataKey="Normal Rate (%)"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-center text-[10px] text-slate-400 font-medium py-2">No monthly trend data computed.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Clinical Alerts Summary Widget */}
          <div className="p-5 bg-white border border-slate-300 rounded shadow-xs space-y-4 animate-fade-in" id="at-risk-alerts">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />
                <h3 className="font-bold uppercase text-slate-800 text-xs tracking-wider font-sans">
                  Clinical Alerts & Data Quality Monitoring Summary
                </h3>
              </div>
              <button
                onClick={() => setActiveSubTab("alerts")}
                className="text-[10px] bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold border border-rose-200 px-2.5 py-1 rounded transition-colors cursor-pointer uppercase flex items-center gap-1 font-sans"
              >
                Go to Alerts Dashboard →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Object.entries(alertsSummary).map(([key, item]: [string, any]) => {
                let drilldownType: any = "general";
                if (key === "noBmi") drilldownType = "no_bmi";
                else if (key === "missingVlSampleDate") drilldownType = "viral_load_sample";
                else if (key === "missingVlResult") drilldownType = "viral_load_result";
                else if (key === "missingDateOfVl") drilldownType = "viral_load_date";
                else if (key === "unsuppressed") drilldownType = "unsuppressed";
                else if (key === "missingDrugPickup") drilldownType = "drug_pickup";
                else if (key === "missingNextAppointment") drilldownType = "appointment";
                else if (key === "iit") drilldownType = "iit";
                else if (key === "sam") drilldownType = "sam";
                else if (key === "mam") drilldownType = "mam";
                else if (key === "presumptiveTb") drilldownType = "presumptive_tb";

                let borderStyle = "border-slate-200 hover:border-slate-300 bg-slate-50/30 text-slate-700";
                let countColor = "text-slate-800";
                let dotColor = "bg-slate-400";
                
                if (item.count > 0) {
                  if (item.severity === "🔴") {
                    borderStyle = "border-rose-300 hover:border-rose-400 bg-rose-50/20 text-rose-950 shadow-rose-50/50";
                    countColor = "text-rose-700";
                    dotColor = "bg-rose-600 animate-pulse";
                  } else {
                    borderStyle = "border-orange-300 hover:border-orange-400 bg-orange-50/20 text-orange-950 shadow-orange-50/50";
                    countColor = "text-orange-600";
                    dotColor = "bg-orange-500";
                  }
                } else {
                  borderStyle = "border-emerald-200 hover:border-emerald-300 bg-emerald-50/20 text-emerald-950 shadow-emerald-50/50";
                  countColor = "text-emerald-700";
                  dotColor = "bg-emerald-500";
                }

                return (
                  <div
                    key={key}
                    onClick={() => handleDrilldown(item.name, item.list, drilldownType)}
                    className={`p-3 border rounded transition-all cursor-pointer hover:shadow-xs flex items-center justify-between gap-2 h-14 ${borderStyle}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}></span>
                      <span className="text-[11px] font-bold truncate leading-tight block">{item.name}</span>
                    </div>
                    <span className={`text-[11px] font-mono font-extrabold px-2 py-0.5 rounded-sm bg-white border border-slate-200/60 shrink-0 ${countColor}`}>
                      {item.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Primary KPI Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* KPI 1: Active CMP */}
            <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Target (CMP)</span>
                <h3 className="text-xl font-bold text-slate-900 mt-1">{overall.ActiveCMP.toLocaleString()}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5 font-semibold">Active OVC beneficiaries</p>
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
                <p className="text-[11px] text-slate-500 mt-0.5 font-semibold">Enrolled clinical cohorts</p>
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
                <p className="text-[11px] text-slate-500 mt-0.5 font-semibold">Grand total loaded records</p>
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
                <p className="text-[11px] text-slate-500 mt-0.5 font-semibold">LGAs in reporting dataset</p>
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
                <p className="text-[11px] text-slate-500 mt-0.5 font-semibold">Active service communities</p>
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
                <p className="text-[11px] text-slate-500 mt-0.5 font-semibold">Active care workers deployed</p>
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
                <h3 className="text-xs font-bold uppercase text-slate-800 flex items-center gap-1.5 font-sans">
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
                  <span className="text-[11px] font-bold text-slate-600">Disaggregation Rule Check: Passed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span className="text-[11px] font-bold text-slate-600">Outstanding Equation Balance: Passed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  <span className="text-[11px] font-bold text-slate-600">Coverage Boundary Logic: Passed</span>
                </div>
              </div>
            ) : (
              <div className="mt-3 p-2.5 bg-red-100 border border-red-300 rounded space-y-1">
                {validation.errors.map((err, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-[11px] text-red-700 font-bold">
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
                <h3 className="font-bold uppercase text-slate-800 text-xs tracking-wider font-sans">CCW Coverage Rankings (Top & Bottom)</h3>
                <span className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded">Sorted by %</span>
              </div>

              <div className="space-y-4">
                {/* Top Performers */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1 mb-2 font-sans">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Top Performing CCWs
                  </h4>
                  <div className="space-y-1.5">
                    {topCcws.length > 0 ? (
                      topCcws.map((c, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded transition-colors">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{c.name}</p>
                            <p className="text-[10px] text-slate-400 font-semibold truncate">{c.childCount ? `${c.childCount} Communities` : "CCW Staff"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-700">{c.Coverage.toFixed(1)}%</p>
                            <p className="text-[9px] text-slate-400 font-bold">Served: {c.TotalServed} / {c.ActiveCMP}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 font-semibold">No active CCW records computed.</p>
                    )}
                  </div>
                </div>

                {/* Bottom Performers */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-red-500 flex items-center gap-1 mb-2 font-sans">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    Underperforming CCWs (Action Required)
                  </h4>
                  <div className="space-y-1.5">
                    {bottomCcws.length > 0 ? (
                      bottomCcws.map((c, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-red-50/40 border border-red-200 rounded transition-colors">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{c.name}</p>
                            <p className="text-[10px] text-red-600 font-bold truncate">Outstanding: {c.Outstanding}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-red-600">{c.Coverage.toFixed(1)}%</p>
                            <p className="text-[9px] text-slate-400 font-bold">Served: {c.TotalServed} / {c.ActiveCMP}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 font-semibold">No active underperforming CCWs.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* LGA Performance Standings */}
            <div className="p-4 bg-white border border-slate-300 rounded shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <h3 className="font-bold uppercase text-slate-800 text-xs tracking-wider font-sans">LGA Coverage Standings</h3>
                <span className="text-[9px] bg-slate-100 border border-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded">Summary by LGA</span>
              </div>

              <div className="space-y-4">
                {/* Top LGAs */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1 mb-2 font-sans">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    Highest Performing LGAs
                  </h4>
                  <div className="space-y-1.5">
                    {topLgas.length > 0 ? (
                      topLgas.map((l, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded transition-colors">
                          <div>
                            <p className="text-xs font-bold text-slate-700">{l.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold">Total Active Targets: {l.ActiveCMP}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-slate-700">{l.Coverage.toFixed(1)}%</p>
                            <p className="text-[9px] text-slate-400 font-bold">Outstanding: {l.Outstanding}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 font-semibold">No LGA records computed.</p>
                    )}
                  </div>
                </div>

                {/* Bottom LGAs */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-red-500 flex items-center gap-1 mb-2 font-sans">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    Underperforming LGAs (Requires Review)
                  </h4>
                  <div className="space-y-1.5">
                    {bottomLgas.length > 0 ? (
                      bottomLgas.map((l, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-red-50/40 border border-red-200 rounded transition-colors">
                          <div>
                            <p className="text-xs font-bold text-slate-700">{l.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold">Total Active Targets: {l.ActiveCMP}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-red-600">{l.Coverage.toFixed(1)}%</p>
                            <p className="text-[9px] text-slate-400 font-bold">Outstanding: {l.Outstanding}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 font-semibold">No underperforming LGAs.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* RENDER THE REUSABLE CLINICAL DRILLDOWN MODAL */}
      {drilldown && drilldown.isOpen && (
        <ClinicalDrilldownModal
          isOpen={drilldown.isOpen}
          title={drilldown.title}
          type={drilldown.type}
          beneficiaries={drilldown.list}
          onClose={() => setDrilldown(null)}
        />
      )}

    </div>
  );
}
