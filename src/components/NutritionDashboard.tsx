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
  Cell,
  LineChart,
  Line
} from "recharts";
import { Users, CheckCircle, AlertTriangle, AlertOctagon, Heart, Scale } from "lucide-react";
import { Beneficiary, ReportFilters } from "../types";
import { parseDate, isDateInReportingPeriod } from "../utils/reportingEngine";

interface NutritionDashboardProps {
  filteredBeneficiaries: Beneficiary[];
  onDrilldown: (title: string, list: Beneficiary[], type: "nutrition" | "tb" | "general") => void;
  filters: ReportFilters;
  targetDate: Date;
}

// Robust nutrition category mapper
export function getNutritionCategory(b: Beneficiary): "SAM" | "MAM" | "MILD" | "NORMAL" | "UNKNOWN" {
  const status = String(b.NutritionStatus || "").toUpperCase().trim();
  if (status.includes("SAM") || status.includes("SEVERE") || status.includes("WASTED") || status.includes("MALNOURISHED")) return "SAM";
  if (status.includes("MAM") || status.includes("MODERATE") || status.includes("UNDERWEIGHT")) return "MAM";
  if (status.includes("MILD")) return "MILD";
  if (status.includes("NORMAL")) return "NORMAL";
  return "UNKNOWN";
}

export default function NutritionDashboard({
  filteredBeneficiaries,
  onDrilldown,
  filters,
  targetDate
}: NutritionDashboardProps) {
  
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

  // 2. Compute KPIs from the current reporting period
  const kpis = useMemo(() => {
    let normal = 0;
    let mild = 0;
    let mam = 0;
    let sam = 0;
    let unknown = 0;

    inPeriodBeneficiaries.forEach((b) => {
      const cat = getNutritionCategory(b);
      if (cat === "NORMAL") normal++;
      else if (cat === "MILD") mild++;
      else if (cat === "MAM") mam++;
      else if (cat === "SAM") sam++;
      else unknown++;
    });

    const totalAssessed = normal + mild + mam + sam;

    return {
      normal,
      mild,
      mam,
      sam,
      unknown,
      totalAssessed,
      rawNormalList: inPeriodBeneficiaries.filter((b) => getNutritionCategory(b) === "NORMAL"),
      rawMildList: inPeriodBeneficiaries.filter((b) => getNutritionCategory(b) === "MILD"),
      rawMamList: inPeriodBeneficiaries.filter((b) => getNutritionCategory(b) === "MAM"),
      rawSamList: inPeriodBeneficiaries.filter((b) => getNutritionCategory(b) === "SAM"),
      rawUnknownList: inPeriodBeneficiaries.filter((b) => getNutritionCategory(b) === "UNKNOWN"),
      rawAssessedList: inPeriodBeneficiaries.filter((b) => getNutritionCategory(b) !== "UNKNOWN")
    };
  }, [inPeriodBeneficiaries]);

  // 3. Chart 1: Nutrition Status Distribution (Pie Chart)
  const pieData = useMemo(() => {
    return [
      { name: "Normal", value: kpis.normal, color: "#10b981" },
      { name: "Mild", value: kpis.mild, color: "#f59e0b" },
      { name: "MAM", value: kpis.mam, color: "#f97316" },
      { name: "SAM", value: kpis.sam, color: "#ef4444" },
      { name: "Not Assessed", value: kpis.unknown, color: "#64748b" }
    ].filter((d) => d.value > 0);
  }, [kpis]);

  // 4. Charts 2 & 3: Malnutrition by LGA (MAM & SAM counts)
  const lgaMalnutritionData = useMemo(() => {
    const map = new Map<string, { lga: string; MAM: number; SAM: number }>();
    inPeriodBeneficiaries.forEach((b) => {
      const lga = b.LGA || "Unknown LGA";
      if (!map.has(lga)) {
        map.set(lga, { lga, MAM: 0, SAM: 0 });
      }
      const cat = getNutritionCategory(b);
      const entry = map.get(lga)!;
      if (cat === "MAM") entry.MAM++;
      else if (cat === "SAM") entry.SAM++;
    });
    return Array.from(map.values()).sort((a, b) => (b.SAM + b.MAM) - (a.SAM + a.MAM));
  }, [inPeriodBeneficiaries]);

  // 5. Charts 4 & 5: Trend by Month (MAM & SAM counts) using filtered beneficiaries (broad trend view)
  const monthlyTrendData = useMemo(() => {
    const map = new Map<string, { month: string; rawDate: Date; MAM: number; SAM: number }>();
    filteredBeneficiaries.forEach((b) => {
      if (filters.OVCStatus !== "All" && b.OVCStatus !== "Active") return;
      if (!b.DateOfLatestServiceProvided) return;
      
      const dateParts = b.DateOfLatestServiceProvided.split("-");
      if (dateParts.length < 2) return;
      
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1;
      if (isNaN(year) || isNaN(month)) return;

      const date = new Date(year, month, 15);
      const monthStr = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const startOfMonth = new Date(year, month, 1);
      
      if (!map.has(monthStr)) {
        map.set(monthStr, { month: monthStr, rawDate: startOfMonth, MAM: 0, SAM: 0 });
      }
      const cat = getNutritionCategory(b);
      const entry = map.get(monthStr)!;
      if (cat === "MAM") entry.MAM++;
      else if (cat === "SAM") entry.SAM++;
    });
    return Array.from(map.values()).sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
  }, [filteredBeneficiaries, filters.OVCStatus]);

  // 6. Chart 6: Nutrition Status by Community (Stacked Bar)
  const communityNutritionData = useMemo(() => {
    const map = new Map<string, { name: string; Normal: number; Mild: number; MAM: number; SAM: number; Unknown: number }>();
    inPeriodBeneficiaries.forEach((b) => {
      const comm = b.Community || "Unknown Community";
      if (!map.has(comm)) {
        map.set(comm, { name: comm, Normal: 0, Mild: 0, MAM: 0, SAM: 0, Unknown: 0 });
      }
      const entry = map.get(comm)!;
      const cat = getNutritionCategory(b);
      if (cat === "NORMAL") entry.Normal++;
      else if (cat === "MILD") entry.Mild++;
      else if (cat === "MAM") entry.MAM++;
      else if (cat === "SAM") entry.SAM++;
      else entry.Unknown++;
    });
    return Array.from(map.values()).slice(0, 8).sort((a, b) => (b.SAM + b.MAM) - (a.SAM + a.MAM));
  }, [inPeriodBeneficiaries]);

  // 7. Chart 7: Nutrition Status by CCW (Horizontal Stacked Bar)
  const ccwNutritionData = useMemo(() => {
    const map = new Map<string, { name: string; Normal: number; Mild: number; MAM: number; SAM: number; Unknown: number }>();
    inPeriodBeneficiaries.forEach((b) => {
      const ccw = b.CCWName || "Unassigned CCW";
      if (!map.has(ccw)) {
        map.set(ccw, { name: ccw, Normal: 0, Mild: 0, MAM: 0, SAM: 0, Unknown: 0 });
      }
      const entry = map.get(ccw)!;
      const cat = getNutritionCategory(b);
      if (cat === "NORMAL") entry.Normal++;
      else if (cat === "MILD") entry.Mild++;
      else if (cat === "MAM") entry.MAM++;
      else if (cat === "SAM") entry.SAM++;
      else entry.Unknown++;
    });
    return Array.from(map.values()).slice(0, 8).sort((a, b) => (b.SAM + b.MAM) - (a.SAM + a.MAM));
  }, [inPeriodBeneficiaries]);

  // Interactive Click Handlers
  const handlePieClick = (index: number) => {
    const item = pieData[index];
    if (!item) return;
    
    let statusList: Beneficiary[] = [];
    if (item.name === "Normal") {
      statusList = kpis.rawNormalList;
    } else if (item.name === "Mild") {
      statusList = kpis.rawMildList;
    } else if (item.name === "MAM") {
      statusList = kpis.rawMamList;
    } else if (item.name === "SAM") {
      statusList = kpis.rawSamList;
    } else if (item.name === "Not Assessed") {
      statusList = kpis.rawUnknownList;
    }

    onDrilldown(`${item.name} Nutrition Beneficiary List`, statusList, "nutrition");
  };

  const handleLgaBarClick = (data: any, type: "MAM" | "SAM") => {
    if (!data || !data.lga) return;
    const lgaName = data.lga;
    const list = inPeriodBeneficiaries.filter((b) => b.LGA === lgaName && getNutritionCategory(b) === type);
    onDrilldown(`${type} Cases in ${lgaName} LGA`, list, "nutrition");
  };

  const handleCommunityBarClick = (data: any) => {
    if (!data || !data.name) return;
    const communityName = data.name;
    const list = inPeriodBeneficiaries.filter((b) => b.Community === communityName);
    onDrilldown(`Nutrition Status Breakdown for Community: ${communityName}`, list, "nutrition");
  };

  const handleCcwBarClick = (data: any) => {
    if (!data || !data.name) return;
    const ccwName = data.name;
    const list = inPeriodBeneficiaries.filter((b) => b.CCWName === ccwName);
    onDrilldown(`Nutrition Caseload managed by CCW: ${ccwName}`, list, "nutrition");
  };

  return (
    <div className="space-y-6" id="nutrition-assessment-dashboard">
      
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Severe Acute Malnutrition (SAM) */}
        <div
          onClick={() => onDrilldown("Severe Acute Malnutrition (SAM) Cases in Reporting Period", kpis.rawSamList, "nutrition")}
          className="p-4 bg-red-50 border border-red-300 rounded shadow-xs cursor-pointer hover:border-red-600 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider">🔴 Severe Acute (SAM)</span>
            <Heart className="w-5 h-5 text-red-600" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-extrabold text-red-600">{kpis.sam}</h3>
            <p className="text-[10px] text-red-500 font-bold mt-0.5 animate-pulse">
              IMMEDIATE MEDICAL ACTION REQUIRED
            </p>
          </div>
        </div>

        {/* Moderate Acute Malnutrition (MAM) */}
        <div
          onClick={() => onDrilldown("Moderate Acute Malnutrition (MAM) Cases in Reporting Period", kpis.rawMamList, "nutrition")}
          className="p-4 bg-orange-50 border border-orange-300 rounded shadow-xs cursor-pointer hover:border-orange-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-orange-800 uppercase tracking-wider">🟠 Moderate Acute (MAM)</span>
            <AlertOctagon className="w-5 h-5 text-orange-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-extrabold text-orange-600">{kpis.mam}</h3>
            <p className="text-[10px] text-orange-500 font-semibold mt-0.5">
              Requires nutrition supplements
            </p>
          </div>
        </div>

        {/* Normal Nutrition */}
        <div
          onClick={() => onDrilldown("Normal Nutrition Status Beneficiaries in Reporting Period", kpis.rawNormalList, "nutrition")}
          className="p-4 bg-emerald-50 border border-emerald-300 rounded shadow-xs cursor-pointer hover:border-emerald-600 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">🟢 Normal Nutrition</span>
            <CheckCircle className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-bold text-emerald-600">{kpis.normal}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
              {kpis.totalAssessed > 0 ? ((kpis.normal / kpis.totalAssessed) * 100).toFixed(1) : 0}% of assessed
            </p>
          </div>
        </div>

        {/* Unknown / Not Assessed */}
        <div
          onClick={() => onDrilldown("Unknown / Not Assessed Beneficiaries in Reporting Period", kpis.rawUnknownList, "nutrition")}
          className="p-4 bg-slate-50 border border-slate-300 rounded shadow-xs cursor-pointer hover:border-slate-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">⚪ Unknown / Not Assessed</span>
            <Users className="w-5 h-5 text-slate-400" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-bold text-slate-600">{kpis.unknown}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
              Missing assessment records
            </p>
          </div>
        </div>

        {/* Total Assessed Summary */}
        <div
          onClick={() => onDrilldown("Total Assessed Beneficiaries in Reporting Period", kpis.rawAssessedList, "nutrition")}
          className="p-4 bg-white border border-slate-300 rounded shadow-xs cursor-pointer hover:border-blue-500 hover:shadow-md transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Assessed</span>
            <Scale className="w-5 h-5 text-blue-500" />
          </div>
          <div className="mt-2">
            <h3 className="text-2xl font-bold text-slate-800">{kpis.totalAssessed}</h3>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
              Active screened in period
            </p>
          </div>
        </div>

      </div>

      {/* Charts Layout (Bento Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Chart 1: Distribution Pie */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Nutrition Status Distribution</h4>
          <div className="flex-1 min-h-0 relative">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        onClick={() => handlePieClick(index)}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No active data for period
              </div>
            )}
          </div>
          <span className="text-[9px] text-slate-400 italic text-center block mt-1">
            Click on any slice to drill down into corresponding records.
          </span>
        </div>

        {/* Chart 2: MAM by LGA */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Moderate Acute Malnutrition (MAM) by LGA</h4>
          <div className="flex-1 min-h-0">
            {lgaMalnutritionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lgaMalnutritionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="lga" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="MAM"
                    fill="#f97316"
                    radius={[2, 2, 0, 0]}
                    onClick={(data) => handleLgaBarClick(data, "MAM")}
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
          <span className="text-[9px] text-slate-400 italic text-center block mt-1">
            Click any bar to drill down.
          </span>
        </div>

        {/* Chart 3: SAM by LGA */}
        <div className="p-4 bg-rose-50/20 border border-rose-300/40 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-rose-800 uppercase tracking-wider mb-2">Severe Acute Malnutrition (SAM) by LGA</h4>
          <div className="flex-1 min-h-0">
            {lgaMalnutritionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lgaMalnutritionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffe4e6" />
                  <XAxis dataKey="lga" stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                  <Tooltip />
                  <Bar
                    dataKey="SAM"
                    fill="#dc2626"
                    radius={[2, 2, 0, 0]}
                    onClick={(data) => handleLgaBarClick(data, "SAM")}
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
          <span className="text-[9px] text-rose-400 italic text-center block mt-1">
            Click any bar to drill down.
          </span>
        </div>

        {/* Chart 4: MAM Trend */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">MAM Trend by Month (Historical)</h4>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={9} />
                <YAxis stroke="#94a3b8" fontSize={9} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="MAM"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#f97316" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 5: SAM Trend */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">SAM Trend by Month (Historical)</h4>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={9} />
                <YAxis stroke="#94a3b8" fontSize={9} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="SAM"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#ef4444" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 6: Stacked Community */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80 md:col-span-1">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Nutrition Status by Community (Top 8)</h4>
          <div className="flex-1 min-h-0">
            {communityNutritionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={communityNutritionData} stackOffset="expand">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={8} />
                  <Tooltip />
                  <Legend iconSize={6} wrapperStyle={{ fontSize: "9px" }} />
                  <Bar dataKey="Normal" stackId="a" fill="#10b981" onClick={handleCommunityBarClick} className="cursor-pointer" />
                  <Bar dataKey="Mild" stackId="a" fill="#f59e0b" onClick={handleCommunityBarClick} className="cursor-pointer" />
                  <Bar dataKey="MAM" stackId="a" fill="#f97316" onClick={handleCommunityBarClick} className="cursor-pointer" />
                  <Bar dataKey="SAM" stackId="a" fill="#ef4444" onClick={handleCommunityBarClick} className="cursor-pointer" />
                  <Bar dataKey="Unknown" stackId="a" fill="#64748b" onClick={handleCommunityBarClick} className="cursor-pointer" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No active data for period
              </div>
            )}
          </div>
        </div>

        {/* Chart 7: CCW Horiz */}
        <div className="p-4 bg-white border border-slate-300 rounded shadow-xs flex flex-col justify-between h-80 md:col-span-2 lg:col-span-3">
          <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2">Nutrition Caseload Distribution by CCW Name (Top 8)</h4>
          <div className="flex-1 min-h-0">
            {ccwNutritionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ccwNutritionData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" stroke="#94a3b8" fontSize={9} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={8} tickLine={false} width={80} />
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                  <Bar dataKey="Normal" stackId="a" fill="#10b981" onClick={handleCcwBarClick} className="cursor-pointer" />
                  <Bar dataKey="Mild" stackId="a" fill="#f59e0b" onClick={handleCcwBarClick} className="cursor-pointer" />
                  <Bar dataKey="MAM" stackId="a" fill="#f97316" onClick={handleCcwBarClick} className="cursor-pointer" />
                  <Bar dataKey="SAM" stackId="a" fill="#ef4444" onClick={handleCcwBarClick} className="cursor-pointer" />
                  <Bar dataKey="Unknown" stackId="a" fill="#64748b" onClick={handleCcwBarClick} className="cursor-pointer" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                No active data for period
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
