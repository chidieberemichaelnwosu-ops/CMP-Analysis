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
import { UserPlus, UserCheck, Calendar, Activity } from "lucide-react";
import { Beneficiary, ReportFilters } from "../types";
import { parseDate, isDateInReportingPeriod } from "../utils/reportingEngine";

interface NewlyEnrolledDashboardProps {
  filteredBeneficiaries: Beneficiary[];
  filters: ReportFilters;
  targetDate: Date;
  onDrilldown: (title: string, list: Beneficiary[], type: "nutrition" | "tb" | "general") => void;
}

export default function NewlyEnrolledDashboard({
  filteredBeneficiaries,
  filters,
  targetDate,
  onDrilldown
}: NewlyEnrolledDashboardProps) {

  // 1. Identify "Newly Enrolled" beneficiaries in period
  const newlyEnrolledBeneficiaries = useMemo(() => {
    return filteredBeneficiaries.filter((b) => {
      // "Only include Active beneficiaries in dashboard performance metrics unless the user explicitly chooses to view all statuses."
      if (filters.OVCStatus !== "All" && b.OVCStatus !== "Active") {
        return false;
      }
      const enrollDate = parseDate(b.DateOfEnrolment);
      if (!enrollDate) return false;

      return isDateInReportingPeriod(
        enrollDate,
        filters.ReportingPeriod,
        filters.StartDate,
        filters.EndDate,
        targetDate
      );
    });
  }, [filteredBeneficiaries, filters, targetDate]);

  // 2. Compute KPIs
  const kpis = useMemo(() => {
    const calhiv = newlyEnrolledBeneficiaries.filter((b) => b.EnrolmentStream === "CALHIV");
    const hei = newlyEnrolledBeneficiaries.filter((b) => b.EnrolmentStream === "HEI");

    return {
      total: newlyEnrolledBeneficiaries.length,
      calhiv: calhiv.length,
      hei: hei.length,
      rawList: newlyEnrolledBeneficiaries,
      rawCalhivList: calhiv,
      rawHeiList: hei
    };
  }, [newlyEnrolledBeneficiaries]);

  // 3. Chart 1: Newly Enrolled by Stream (Pie Chart)
  const streamDistributionData = useMemo(() => {
    return [
      { name: "CALHIV", value: kpis.calhiv, color: "#2563eb" },
      { name: "HEI", value: kpis.hei, color: "#10b981" }
    ].filter((item) => item.value > 0);
  }, [kpis.calhiv, kpis.hei]);

  // 4. Chart 2: Newly Enrolled by LGA
  const lgaData = useMemo(() => {
    const map = new Map<string, { lga: string; count: number }>();
    newlyEnrolledBeneficiaries.forEach((b) => {
      const lga = b.LGA || "Unknown LGA";
      if (!map.has(lga)) {
        map.set(lga, { lga, count: 0 });
      }
      map.get(lga)!.count++;
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [newlyEnrolledBeneficiaries]);

  // 5. Chart 3: Newly Enrolled by CCW (Top 8)
  const ccwData = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    newlyEnrolledBeneficiaries.forEach((b) => {
      const ccw = b.CCWName || "Unassigned CCW";
      if (!map.has(ccw)) {
        map.set(ccw, { name: ccw, count: 0 });
      }
      map.get(ccw)!.count++;
    });
    return Array.from(map.values()).slice(0, 8).sort((a, b) => b.count - a.count);
  }, [newlyEnrolledBeneficiaries]);

  // Interactive Click Handlers
  const handleLgaClick = (data: any) => {
    if (!data || !data.lga) return;
    const lgaName = data.lga;
    const list = newlyEnrolledBeneficiaries.filter((b) => b.LGA === lgaName);
    onDrilldown(`Newly Enrolled in ${lgaName} LGA`, list, "general");
  };

  const handleCcwClick = (data: any) => {
    if (!data || !data.name) return;
    const ccwName = data.name;
    const list = newlyEnrolledBeneficiaries.filter((b) => b.CCWName === ccwName);
    onDrilldown(`Newly Enrolled Managed by CCW ${ccwName}`, list, "general");
  };

  return (
    <div className="space-y-6" id="newly-enrolled-dashboard">
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        {/* Total Newly Enrolled */}
        <div
          onClick={() => onDrilldown("Total Newly Enrolled Beneficiaries", kpis.rawList, "general")}
          className="p-4 bg-white border border-slate-300 rounded shadow-xs cursor-pointer hover:border-blue-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Newly Enrolled</span>
            <UserPlus className="w-5 h-5 text-blue-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-extrabold text-blue-600">{kpis.total}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Newly enrolled in period</p>
          </div>
        </div>

        {/* Newly Enrolled CALHIV */}
        <div
          onClick={() => onDrilldown("Newly Enrolled CALHIV Cohort", kpis.rawCalhivList, "general")}
          className="p-4 bg-white border border-slate-300 rounded shadow-xs cursor-pointer hover:border-blue-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Newly Enrolled CALHIV</span>
            <UserCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-extrabold text-blue-700">{kpis.calhiv}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Children and Adolescents Living with HIV</p>
          </div>
        </div>

        {/* Newly Enrolled HEI */}
        <div
          onClick={() => onDrilldown("Newly Enrolled HEI Cohort", kpis.rawHeiList, "general")}
          className="p-4 bg-white border border-slate-300 rounded shadow-xs cursor-pointer hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Newly Enrolled HEI</span>
            <Activity className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-extrabold text-emerald-600">{kpis.hei}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">HIV Exposed Infants</p>
          </div>
        </div>

      </div>

      {/* Charts Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Chart 1: Newly Enrolled by Stream */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Newly Enrolled by Stream (Pie)</h4>
          <div className="flex-1 min-h-0 flex items-center justify-center">
            {streamDistributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={streamDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {streamDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400 font-semibold uppercase">
                No enrolments found in period
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Newly Enrolled by LGA */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Newly Enrolled by LGA</h4>
          <div className="flex-1 min-h-0">
            {lgaData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lgaData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="lga" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    fill="#3b82f6"
                    radius={[2, 2, 0, 0]}
                    onClick={handleLgaClick}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No enrolments found in period
              </div>
            )}
          </div>
        </div>

        {/* Chart 3: Newly Enrolled by CCW */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Newly Enrolled by Deployed CCW (Top 8)</h4>
          <div className="flex-1 min-h-0">
            {ccwData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ccwData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="count"
                    fill="#10b981"
                    radius={[2, 2, 0, 0]}
                    onClick={handleCcwClick}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No enrolments found in period
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
