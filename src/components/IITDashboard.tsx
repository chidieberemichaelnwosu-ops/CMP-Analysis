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
  PieChart,
  Pie,
  Cell
} from "recharts";
import { AlertOctagon, CheckCircle2, UserX, Map, Users } from "lucide-react";
import { Beneficiary, ReportFilters } from "../types";
import { parseDate, isDateInReportingPeriod } from "../utils/reportingEngine";

interface IITDashboardProps {
  filteredBeneficiaries: Beneficiary[];
  filters: ReportFilters;
  targetDate: Date;
  onDrilldown: (title: string, list: Beneficiary[], type: "nutrition" | "tb" | "general") => void;
}

// Business Rules for IIT Classification
export const isIITCase = (b: Beneficiary): boolean => {
  const art = String(b.CurrentARTStatus || "").toLowerCase().trim();
  const ovc = String(b.OVCStatus || "").toLowerCase().trim();
  // IIT if explicitly marked, or defaulted/interrupted, or if active with explicit IIT indicator
  return (
    art.includes("iit") ||
    art.includes("interruption") ||
    art.includes("default") ||
    art.includes("missed") ||
    ovc.includes("iit")
  );
};

export const isIITReengaged = (b: Beneficiary): boolean => {
  const art = String(b.CurrentARTStatus || "").toLowerCase().trim();
  const serv = String(b.LatestServicesProvided || "").toLowerCase().trim();
  // Marked as re-engaged, or matches IIT definition but currently Active OVC with services provided
  return (
    art.includes("re-engaged") ||
    art.includes("reengaged") ||
    art.includes("re engaged") ||
    (isIITCase(b) && b.OVCStatus === "Active" && serv !== "" && serv !== "none")
  );
};

export const isIITPending = (b: Beneficiary): boolean => {
  return isIITCase(b) && !isIITReengaged(b);
};

export default function IITDashboard({
  filteredBeneficiaries,
  filters,
  targetDate,
  onDrilldown
}: IITDashboardProps) {

  // 1. Get beneficiaries whose latest service date falls within the selected reporting period
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

  // 2. Compute KPIs
  const kpis = useMemo(() => {
    const iitCases = inPeriodBeneficiaries.filter(isIITCase);
    const reengaged = iitCases.filter(isIITReengaged);
    const pending = iitCases.filter(isIITPending);

    return {
      totalIIT: iitCases.length,
      reengaged: reengaged.length,
      pending: pending.length,
      reengagementRate: iitCases.length > 0 ? (reengaged.length / iitCases.length) * 100 : 0,
      rawIITList: iitCases,
      rawReengagedList: reengaged,
      rawPendingList: pending
    };
  }, [inPeriodBeneficiaries]);

  // 3. Chart 1: IIT Cases by LGA
  const lgaIITData = useMemo(() => {
    const map = new Map<string, { lga: string; cases: number }>();
    inPeriodBeneficiaries.forEach((b) => {
      if (isIITCase(b)) {
        const lga = b.LGA || "Unknown LGA";
        if (!map.has(lga)) {
          map.set(lga, { lga, cases: 0 });
        }
        map.get(lga)!.cases++;
      }
    });
    return Array.from(map.values()).sort((a: { lga: string; cases: number }, b: { lga: string; cases: number }) => b.cases - a.cases);
  }, [inPeriodBeneficiaries]);

  // 4. Chart 2: IIT Cases by Community
  const communityIITData = useMemo(() => {
    const map = new Map<string, { name: string; cases: number }>();
    inPeriodBeneficiaries.forEach((b) => {
      if (isIITCase(b)) {
        const comm = b.Community || "Unknown Community";
        if (!map.has(comm)) {
          map.set(comm, { name: comm, cases: 0 });
        }
        map.get(comm)!.cases++;
      }
    });
    return Array.from(map.values()).slice(0, 8).sort((a: { name: string; cases: number }, b: { name: string; cases: number }) => b.cases - a.cases);
  }, [inPeriodBeneficiaries]);

  // 5. Chart 3: IIT Cases by CCW Name
  const ccwIITData = useMemo(() => {
    const map = new Map<string, { name: string; cases: number }>();
    inPeriodBeneficiaries.forEach((b) => {
      if (isIITCase(b)) {
        const ccw = b.CCWName || "Unassigned CCW";
        if (!map.has(ccw)) {
          map.set(ccw, { name: ccw, cases: 0 });
        }
        map.get(ccw)!.cases++;
      }
    });
    return Array.from(map.values()).slice(0, 8).sort((a: { name: string; cases: number }, b: { name: string; cases: number }) => b.cases - a.cases);
  }, [inPeriodBeneficiaries]);

  // Interactive Click handlers
  const handleLgaClick = (data: any) => {
    if (!data || !data.lga) return;
    const lgaName = data.lga;
    const list = inPeriodBeneficiaries.filter((b) => b.LGA === lgaName && isIITCase(b));
    onDrilldown(`IIT Cases in ${lgaName} LGA`, list, "general");
  };

  const handleCommunityClick = (data: any) => {
    if (!data || !data.name) return;
    const communityName = data.name;
    const list = inPeriodBeneficiaries.filter((b) => b.Community === communityName && isIITCase(b));
    onDrilldown(`IIT Cases in ${communityName} Community`, list, "general");
  };

  const handleCcwClick = (data: any) => {
    if (!data || !data.name) return;
    const ccwName = data.name;
    const list = inPeriodBeneficiaries.filter((b) => b.CCWName === ccwName && isIITCase(b));
    onDrilldown(`IIT Cases Managed by CCW ${ccwName}`, list, "general");
  };

  return (
    <div className="space-y-6" id="iit-monitoring-dashboard">
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total IIT Cases */}
        <div
          onClick={() => onDrilldown("Total Interruption in Treatment (IIT) Cases", kpis.rawIITList, "general")}
          className="p-4 bg-white border border-slate-300 rounded shadow-xs cursor-pointer hover:border-red-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total IIT Cases</span>
            <UserX className="w-5 h-5 text-red-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-extrabold text-red-600">{kpis.totalIIT}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Interrupted treatment cohort</p>
          </div>
        </div>

        {/* IIT Re-engaged */}
        <div
          onClick={() => onDrilldown("Successfully Re-engaged Treatment Cases", kpis.rawReengagedList, "general")}
          className="p-4 bg-white border border-slate-300 rounded shadow-xs cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">IIT Re-engaged</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-extrabold text-emerald-600">{kpis.reengaged}</h3>
            <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
              {kpis.reengagementRate.toFixed(1)}% Re-engagement Rate
            </p>
          </div>
        </div>

        {/* IIT Pending Follow-up */}
        <div
          onClick={() => onDrilldown("IIT Cases Pending Active Follow-up", kpis.rawPendingList, "general")}
          className="p-4 bg-white border border-slate-300 rounded shadow-xs cursor-pointer hover:border-orange-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pending Follow-up</span>
            <AlertOctagon className="w-5 h-5 text-orange-500 animate-pulse" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-bold text-orange-600">{kpis.pending}</h3>
            <p className="text-[10px] text-orange-500 font-semibold mt-0.5 animate-pulse">
              Requires urgent home visits
            </p>
          </div>
        </div>

        {/* Total Active CALHIV/HEI in Period */}
        <div
          onClick={() => onDrilldown("Total Served Clinical Cohort in Period", inPeriodBeneficiaries, "general")}
          className="p-4 bg-slate-50 border border-slate-200 rounded shadow-xs cursor-pointer hover:border-slate-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Served Cohort</span>
            <Users className="w-5 h-5 text-slate-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-bold text-slate-800">{inPeriodBeneficiaries.length}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Active served beneficiaries</p>
          </div>
        </div>

      </div>

      {/* Charts Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Chart 1: IIT by LGA */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">IIT Cases by LGA</h4>
          <div className="flex-1 min-h-0">
            {lgaIITData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lgaIITData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="lga" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="cases"
                    fill="#ef4444"
                    radius={[2, 2, 0, 0]}
                    onClick={handleLgaClick}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No IIT cases found in period
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: IIT by Community */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">IIT Cases by Community (Top 8)</h4>
          <div className="flex-1 min-h-0">
            {communityIITData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={communityIITData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="cases"
                    fill="#f97316"
                    radius={[2, 2, 0, 0]}
                    onClick={handleCommunityClick}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No IIT cases found in period
              </div>
            )}
          </div>
        </div>

        {/* Chart 3: IIT by CCW */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">IIT Cases by Deployed CCW Name (Top 8)</h4>
          <div className="flex-1 min-h-0">
            {ccwIITData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ccwIITData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="cases"
                    fill="#ef4444"
                    radius={[2, 2, 0, 0]}
                    onClick={handleCcwClick}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No IIT cases found in period
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
