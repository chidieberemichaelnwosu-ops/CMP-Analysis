/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  LineChart,
  Line
} from "recharts";
import { Activity, ShieldCheck, Heart, UserCheck, AlertOctagon, ClipboardList, Clock } from "lucide-react";
import { Beneficiary, ReportFilters } from "../types";
import { parseDate, isDateInReportingPeriod } from "../utils/reportingEngine";

interface TuberculosisDashboardProps {
  filteredBeneficiaries: Beneficiary[];
  onDrilldown: (title: string, list: Beneficiary[], type: "nutrition" | "tb" | "general") => void;
  filters: ReportFilters;
  targetDate: Date;
}

// Helper classification functions for TB fields
export const isScreened = (b: Beneficiary) => {
  const s = String(b.TBScreeningOutcome || "").toLowerCase().trim();
  return s !== "" && s !== "n/a" && s !== "none" && s !== "not done";
};

export const isPresumptive = (b: Beneficiary) => {
  const s = String(b.TBScreeningOutcome || "").toLowerCase().trim();
  return s.includes("presumptive") || s.includes("symptomatic") || s.includes("positive") || s.includes("suggestive");
};

export const isReferred = (b: Beneficiary) => {
  const r = String(b.ReferredforTBDiagnosis || "").toLowerCase().trim();
  return r === "yes" || r === "true";
};

export const isConfirmed = (b: Beneficiary) => {
  const d = String(b.TBDetected || "").toLowerCase().trim();
  return d === "yes" || d === "detected" || d === "positive" || d === "true";
};

export const isEvaluatedCAD = (b: Beneficiary) => {
  const c = String(b.TBEvaluatedusingCAD || "").toLowerCase().trim();
  return c === "yes" || c === "true";
};

export const isEligibleTPT = (b: Beneficiary) => {
  const e = String(b.EligibleforTBTPT || "").toLowerCase().trim();
  return e === "yes" || e === "true";
};

export const isStartedTPT = (b: Beneficiary) => {
  const c = String(b.CommencedonTBPreventive || "").toLowerCase().trim();
  return c === "yes" || c === "true" || c.includes("commenced") || b.TPTCommencementDate;
};

export const isCompletedTPT = (b: Beneficiary) => {
  const c = String(b.CompletedTPT || "").toLowerCase().trim();
  return c === "yes" || c === "true" || c.includes("completed") || b.TPTCompletionDate;
};

export default function TuberculosisDashboard({
  filteredBeneficiaries,
  onDrilldown,
  filters,
  targetDate
}: TuberculosisDashboardProps) {

  // 1. Get active served beneficiaries in the selected reporting period
  const inPeriodBeneficiaries = useMemo(() => {
    return filteredBeneficiaries.filter((b) => {
      // "Only include Active beneficiaries in dashboard performance metrics unless the user explicitly chooses to view all statuses."
      if (filters.OVCStatus !== "All" && b.OVCStatus !== "Active") {
        return false;
      }
      const serviceDate = parseDate(b.DateOfLatestServiceProvided);
      if (!serviceDate) return false;

      return isDateInReportingPeriod(
        serviceDate,
        filters.ReportingPeriod,
        filters.StartDate,
        filters.EndDate,
        targetDate
      );
    });
  }, [filteredBeneficiaries, filters, targetDate]);

  // 2. Compute KPIs from current reporting period
  const kpis = useMemo(() => {
    let screened = 0;
    let presumptive = 0;
    let referred = 0;
    let confirmed = 0;
    let evaluatedCAD = 0;
    let eligibleTPT = 0;
    let startedTPT = 0;
    let completedTPT = 0;

    inPeriodBeneficiaries.forEach((b) => {
      if (isScreened(b)) screened++;
      if (isPresumptive(b)) presumptive++;
      if (isReferred(b)) referred++;
      if (isConfirmed(b)) confirmed++;
      if (isEvaluatedCAD(b)) evaluatedCAD++;
      if (isEligibleTPT(b)) eligibleTPT++;
      if (isStartedTPT(b)) startedTPT++;
      if (isCompletedTPT(b)) completedTPT++;
    });

    const awaitingDiagnosis = inPeriodBeneficiaries.filter((b) => isPresumptive(b) && !isConfirmed(b)).length;
    
    // Screening Coverage formula: (Active beneficiaries screened / Active beneficiaries served) * 100
    const activeServedCount = inPeriodBeneficiaries.length;
    const screeningCoverage = activeServedCount > 0 ? (screened / activeServedCount) * 100 : 0;

    return {
      screened,
      presumptive,
      referred,
      confirmed,
      evaluatedCAD,
      eligibleTPT,
      startedTPT,
      completedTPT,
      awaitingDiagnosis,
      screeningCoverage,
      activeServedCount,
      rawScreenedList: inPeriodBeneficiaries.filter(isScreened),
      rawPresumptiveList: inPeriodBeneficiaries.filter(isPresumptive),
      rawConfirmedList: inPeriodBeneficiaries.filter(isConfirmed),
      rawAwaitingDiagnosisList: inPeriodBeneficiaries.filter((b) => isPresumptive(b) && !isConfirmed(b)),
      rawEligibleTPTList: inPeriodBeneficiaries.filter(isEligibleTPT),
      rawStartedTPTList: inPeriodBeneficiaries.filter(isStartedTPT),
      rawCompletedTPTList: inPeriodBeneficiaries.filter(isCompletedTPT)
    };
  }, [inPeriodBeneficiaries]);

  // 3. Chart 1: Presumptive TB by LGA (Bar Chart)
  const lgaPresumptiveData = useMemo(() => {
    const map = new Map<string, { lga: string; presumptive: number }>();
    inPeriodBeneficiaries.forEach((b) => {
      if (isPresumptive(b)) {
        const lga = b.LGA || "Unknown LGA";
        map.set(lga, { lga, presumptive: (map.get(lga)?.presumptive || 0) + 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.presumptive - a.presumptive);
  }, [inPeriodBeneficiaries]);

  // 4. Chart 2: Presumptive TB by Community (Bar Chart)
  const communityPresumptiveData = useMemo(() => {
    const map = new Map<string, { name: string; presumptive: number }>();
    inPeriodBeneficiaries.forEach((b) => {
      if (isPresumptive(b)) {
        const comm = b.Community || "Unknown Community";
        map.set(comm, { name: comm, presumptive: (map.get(comm)?.presumptive || 0) + 1 });
      }
    });
    return Array.from(map.values()).slice(0, 8).sort((a, b) => b.presumptive - a.presumptive);
  }, [inPeriodBeneficiaries]);

  // 5. Chart 3: Presumptive TB by CCW (Horizontal Bar Chart)
  const ccwPresumptiveData = useMemo(() => {
    const map = new Map<string, { name: string; presumptive: number }>();
    inPeriodBeneficiaries.forEach((b) => {
      if (isPresumptive(b)) {
        const ccw = b.CCWName || "Unassigned CCW";
        map.set(ccw, { name: ccw, presumptive: (map.get(ccw)?.presumptive || 0) + 1 });
      }
    });
    return Array.from(map.values()).slice(0, 8).sort((a, b) => b.presumptive - a.presumptive);
  }, [inPeriodBeneficiaries]);

  // 6. Chart 4: TB Confirmed by LGA (Bar Chart)
  const lgaConfirmedData = useMemo(() => {
    const map = new Map<string, { lga: string; confirmed: number }>();
    inPeriodBeneficiaries.forEach((b) => {
      if (isConfirmed(b)) {
        const lga = b.LGA || "Unknown LGA";
        map.set(lga, { lga, confirmed: (map.get(lga)?.confirmed || 0) + 1 });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.confirmed - a.confirmed);
  }, [inPeriodBeneficiaries]);

  // 7. Chart 5: TPT Uptake by LGA (Bar Chart)
  const lgaTptUptakeData = useMemo(() => {
    const map = new Map<string, { lga: string; started: number; completed: number }>();
    inPeriodBeneficiaries.forEach((b) => {
      const lga = b.LGA || "Unknown LGA";
      if (!map.has(lga)) {
        map.set(lga, { lga, started: 0, completed: 0 });
      }
      const entry = map.get(lga)!;
      if (isStartedTPT(b)) entry.started++;
      if (isCompletedTPT(b)) entry.completed++;
    });
    return Array.from(map.values()).sort((a, b) => b.started - a.started);
  }, [inPeriodBeneficiaries]);

  // 8. Chart 6: TPT Completion Trend (Historical)
  const monthlyTptCompletionData = useMemo(() => {
    const map = new Map<string, { month: string; rawDate: Date; completed: number }>();
    filteredBeneficiaries.forEach((b) => {
      if (filters.OVCStatus !== "All" && b.OVCStatus !== "Active") return;
      if (!isCompletedTPT(b)) return;
      
      const dateStr = b.TPTCompletionDate || b.DateOfLatestServiceProvided;
      if (!dateStr) return;
      
      const dateParts = dateStr.split("-");
      if (dateParts.length < 2) return;
      
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1;
      if (isNaN(year) || isNaN(month)) return;

      const date = new Date(year, month, 15);
      const monthStr = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const startOfMonth = new Date(year, month, 1);
      
      if (!map.has(monthStr)) {
        map.set(monthStr, { month: monthStr, rawDate: startOfMonth, completed: 0 });
      }
      map.get(monthStr)!.completed++;
    });
    return Array.from(map.values()).sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
  }, [filteredBeneficiaries, filters.OVCStatus]);

  // Click Drills
  const handleLgaPresumptiveClick = (data: any) => {
    if (!data || !data.lga) return;
    const lgaName = data.lga;
    const list = inPeriodBeneficiaries.filter((b) => b.LGA === lgaName && isPresumptive(b));
    onDrilldown(`Presumptive TB Cases in ${lgaName} LGA`, list, "tb");
  };

  const handleCommunityPresumptiveClick = (data: any) => {
    if (!data || !data.name) return;
    const communityName = data.name;
    const list = inPeriodBeneficiaries.filter((b) => b.Community === communityName && isPresumptive(b));
    onDrilldown(`Presumptive TB Cases in ${communityName} Community`, list, "tb");
  };

  const handleCcwPresumptiveClick = (data: any) => {
    if (!data || !data.name) return;
    const ccwName = data.name;
    const list = inPeriodBeneficiaries.filter((b) => b.CCWName === ccwName && isPresumptive(b));
    onDrilldown(`Presumptive TB Cases Assigned to CCW ${ccwName}`, list, "tb");
  };

  const handleLgaConfirmedClick = (data: any) => {
    if (!data || !data.lga) return;
    const lgaName = data.lga;
    const list = inPeriodBeneficiaries.filter((b) => b.LGA === lgaName && isConfirmed(b));
    onDrilldown(`Confirmed TB Cases in ${lgaName} LGA`, list, "tb");
  };

  const handleTptUptakeClick = (data: any, type: "started" | "completed") => {
    if (!data || !data.lga) return;
    const lgaName = data.lga;
    const list = inPeriodBeneficiaries.filter(
      (b) => b.LGA === lgaName && (type === "started" ? isStartedTPT(b) : isCompletedTPT(b))
    );
    onDrilldown(`TPT ${type === "started" ? "Commenced" : "Completed"} Cases in ${lgaName} LGA`, list, "tb");
  };

  return (
    <div className="space-y-6" id="tb-monitoring-dashboard">
      
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        
        {/* Presumptive TB Cases */}
        <div
          onClick={() => onDrilldown("Presumptive TB Cases in Reporting Period", kpis.rawPresumptiveList, "tb")}
          className="p-3 bg-white border border-slate-300 rounded shadow-xs cursor-pointer hover:border-amber-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Presumptive TB</span>
            <AlertOctagon className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl font-extrabold text-amber-600">{kpis.presumptive}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Symptomatic cases</p>
          </div>
        </div>

        {/* TB Confirmed */}
        <div
          onClick={() => onDrilldown("Confirmed TB Cases in Reporting Period", kpis.rawConfirmedList, "tb")}
          className="p-3 bg-red-50 border border-red-300 rounded shadow-xs cursor-pointer hover:border-red-600 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-red-800 uppercase tracking-wider">TB Confirmed</span>
            <Heart className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl font-extrabold text-red-600">{kpis.confirmed}</h3>
            <p className="text-[10px] text-red-500 font-bold mt-0.5">Laboratory confirmed</p>
          </div>
        </div>

        {/* Awaiting TB Diagnosis */}
        <div
          onClick={() => onDrilldown("Presumptive Cases Awaiting Diagnostic Outcome", kpis.rawAwaitingDiagnosisList, "tb")}
          className="p-3 bg-white border border-slate-300 rounded shadow-xs cursor-pointer hover:border-blue-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Awaiting Diagnosis</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl font-extrabold text-blue-600">{kpis.awaitingDiagnosis}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Pending results</p>
          </div>
        </div>

        {/* Eligible for TPT */}
        <div
          onClick={() => onDrilldown("Eligible for TB Preventive Therapy (TPT)", kpis.rawEligibleTPTList, "tb")}
          className="p-3 bg-white border border-slate-300 rounded shadow-xs cursor-pointer hover:border-slate-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Eligible for TPT</span>
            <ClipboardList className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl font-bold text-slate-800">{kpis.eligibleTPT}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Uptake candidates</p>
          </div>
        </div>

        {/* Started TPT */}
        <div
          onClick={() => onDrilldown("Commenced on TB Preventive Therapy (TPT)", kpis.rawStartedTPTList, "tb")}
          className="p-3 bg-white border border-slate-300 rounded shadow-xs cursor-pointer hover:border-blue-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Started TPT</span>
            <UserCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl font-bold text-blue-600">{kpis.startedTPT}</h3>
            <p className="text-[10px] text-blue-500 font-semibold mt-0.5">Therapy commenced</p>
          </div>
        </div>

        {/* TPT Completed */}
        <div
          onClick={() => onDrilldown("Completed TB Preventive Therapy (TPT)", kpis.rawCompletedTPTList, "tb")}
          className="p-3 bg-emerald-50 border border-emerald-300 rounded shadow-xs cursor-pointer hover:border-emerald-600 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-wider">TPT Completed</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl font-bold text-emerald-600">{kpis.completedTPT}</h3>
            <p className="text-[10px] text-emerald-600 font-bold mt-0.5">Uptake success</p>
          </div>
        </div>

        {/* TB Screening Coverage */}
        <div
          onClick={() => onDrilldown("Total Active served in Period", inPeriodBeneficiaries, "tb")}
          className="p-3 bg-emerald-500 text-white rounded shadow-xs cursor-pointer hover:bg-emerald-600 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-emerald-100 uppercase tracking-wider">Screening Coverage</span>
            <Activity className="w-4 h-4 text-emerald-100" />
          </div>
          <div className="mt-2">
            <h3 className="text-xl font-black">{kpis.screeningCoverage.toFixed(1)}%</h3>
            <p className="text-[9px] text-emerald-100 font-medium">Of served cohort ({kpis.screened}/{kpis.activeServedCount})</p>
          </div>
        </div>

      </div>

      {/* Charts Layout (Bento Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Chart 1: Presumptive TB by LGA */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Presumptive TB Cases by LGA</h4>
          <div className="flex-1 min-h-0">
            {lgaPresumptiveData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lgaPresumptiveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="lga" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="presumptive"
                    fill="#f59e0b"
                    radius={[2, 2, 0, 0]}
                    onClick={handleLgaPresumptiveClick}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No active presumptive cases
              </div>
            )}
          </div>
          <span className="text-[9px] text-slate-400 italic text-center block mt-1">
            Click any bar to drill down.
          </span>
        </div>

        {/* Chart 2: Confirmed TB by LGA */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Confirmed TB Cases by LGA</h4>
          <div className="flex-1 min-h-0">
            {lgaConfirmedData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lgaConfirmedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="lga" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="confirmed"
                    fill="#ef4444"
                    radius={[2, 2, 0, 0]}
                    onClick={handleLgaConfirmedClick}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No active confirmed cases
              </div>
            )}
          </div>
          <span className="text-[9px] text-slate-400 italic text-center block mt-1">
            Click any bar to drill down.
          </span>
        </div>

        {/* Chart 3: TPT Uptake by LGA */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">TPT Uptake (Started vs Completed) by LGA</h4>
          <div className="flex-1 min-h-0">
            {lgaTptUptakeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lgaTptUptakeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="lga" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                  <Bar
                    dataKey="started"
                    name="Started"
                    fill="#3b82f6"
                    radius={[2, 2, 0, 0]}
                    onClick={(data) => handleTptUptakeClick(data, "started")}
                    className="cursor-pointer"
                  />
                  <Bar
                    dataKey="completed"
                    name="Completed"
                    fill="#10b981"
                    radius={[2, 2, 0, 0]}
                    onClick={(data) => handleTptUptakeClick(data, "completed")}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No active data for period
              </div>
            )}
          </div>
        </div>

        {/* Chart 4: Presumptive TB by Community */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Presumptive TB by Community (Top 8)</h4>
          <div className="flex-1 min-h-0">
            {communityPresumptiveData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={communityPresumptiveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="presumptive"
                    fill="#f59e0b"
                    radius={[2, 2, 0, 0]}
                    onClick={handleCommunityPresumptiveClick}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No active presumptive cases
              </div>
            )}
          </div>
        </div>

        {/* Chart 5: Presumptive TB by CCW */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Presumptive TB by CCW (Top 8)</h4>
          <div className="flex-1 min-h-0">
            {ccwPresumptiveData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ccwPresumptiveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="presumptive"
                    fill="#f59e0b"
                    radius={[2, 2, 0, 0]}
                    onClick={handleCcwPresumptiveClick}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No active presumptive cases
              </div>
            )}
          </div>
        </div>

        {/* Chart 6: TPT Completion Trend */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">TPT Completion Trend (Historical)</h4>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTptCompletionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={9} />
                <YAxis stroke="#94a3b8" fontSize={9} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="completed"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#10b981" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

    </div>
  );
}
