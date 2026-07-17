/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line
} from "recharts";
import {
  AlertTriangle,
  Settings2,
  BellRing,
  RefreshCw,
  Search,
  Users,
  LayoutGrid,
  FileBarChart,
  CheckCircle2,
  TrendingUp,
  MapPin,
  Heart
} from "lucide-react";
import { Beneficiary, ReportFilters } from "../types";
import {
  calculateClinicalAlerts,
  AlertDetail,
  ClinicalAlertsSummary
} from "../utils/clinicalAlertsEngine";

interface ClinicalAlertsDashboardProps {
  filteredBeneficiaries: Beneficiary[];
  filters: ReportFilters;
  targetDate: Date;
  onDrilldown: (
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
  ) => void;
}

export default function ClinicalAlertsDashboard({
  filteredBeneficiaries,
  filters,
  targetDate,
  onDrilldown
}: ClinicalAlertsDashboardProps) {
  // IIT Threshold Configuration
  const [iitThreshold, setIitThreshold] = useState<number>(() => {
    const saved = localStorage.getItem("caprs_iit_threshold_days");
    return saved ? parseInt(saved, 10) : 28;
  });

  // Stored baselines for "new alerts since last sync" tracking
  const [baselines, setBaselines] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem("caprs_alerts_sync_baselines");
    return saved ? JSON.parse(saved) : {};
  });

  const [activeChartTab, setActiveChartTab] = useState<"unsuppressed" | "iit">("unsuppressed");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>("");

  // Persist IIT threshold days
  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10) || 1;
    setIitThreshold(val);
    localStorage.setItem("caprs_iit_threshold_days", String(val));
  };

  // Run core calculation engine on active global filters and configurations
  const { summary, unsuppressedCharts, iitCharts } = useMemo(() => {
    return calculateClinicalAlerts(filteredBeneficiaries, filters, targetDate, iitThreshold);
  }, [filteredBeneficiaries, filters, targetDate, iitThreshold]);

  // Synchronize counts & set baselines
  const handleSyncBaselines = () => {
    const currentCounts: Record<string, number> = {};
    Object.keys(summary).forEach((key) => {
      currentCounts[key] = summary[key as keyof ClinicalAlertsSummary].count;
    });
    setBaselines(currentCounts);
    localStorage.setItem("caprs_alerts_sync_baselines", JSON.stringify(currentCounts));
    
    setSyncStatus("Alerts synchronized with database baseline!");
    setTimeout(() => setSyncStatus(""), 3000);
  };

  // Calculate "new" badge count helper
  const getNewAlertCount = (key: string, currentCount: number): number => {
    const baseline = baselines[key] ?? 0;
    const diff = currentCount - baseline;
    return diff > 0 ? diff : 0;
  };

  // Calculate total active OVC list
  const activeCount = useMemo(() => {
    return filteredBeneficiaries.filter((b) => b.OVCStatus === "Active").length;
  }, [filteredBeneficiaries]);

  return (
    <div className="space-y-6" id="clinical-alerts-monitoring-dashboard">
      
      {/* Header Panel with Sync and Configuration Trigger */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 bg-white border border-slate-200 rounded shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-ping"></span>
            Clinical Alerts & Data Quality Monitoring
          </h2>
          <p className="text-xs font-semibold text-slate-400 mt-0.5 leading-relaxed">
            Real-time automated line list monitoring for clinical compliance, viral load tracking, and treatment interruption gaps.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* IIT Admin Rules toggle */}
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-bold transition-all border cursor-pointer uppercase ${
              isConfigOpen
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            <Settings2 className="w-4 h-4" />
            IIT Rules Setup
          </button>

          {/* Sync Baselining button */}
          <button
            onClick={handleSyncBaselines}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded shadow-xs cursor-pointer uppercase transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Sync Baseline
          </button>
        </div>
      </div>

      {/* Sync Status Toast Notification */}
      {syncStatus && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold rounded flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {syncStatus}
        </div>
      )}

      {/* Expandable Administrative Rule Configuration Panel */}
      {isConfigOpen && (
        <div className="p-5 bg-slate-50 border border-slate-200 rounded shadow-xs space-y-4 animate-fade-in" id="iit-config-panel">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <Settings2 className="w-4 h-4 text-slate-600" />
            <h3 className="font-bold uppercase text-slate-700 text-xs tracking-wider">
              Clinical Alert Definitions & Administrative Rules
            </h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block uppercase tracking-wide">
                Interruption in Treatment (IIT) Threshold (Days):
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="7"
                  max="90"
                  step="1"
                  value={iitThreshold}
                  onChange={handleThresholdChange}
                  className="flex-1 accent-blue-600 cursor-pointer"
                />
                <span className="font-mono font-extrabold text-sm text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded">
                  {iitThreshold} Days
                </span>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                OVC beneficiaries missing their appointments or drug refills by this threshold will be flagged as IIT, in addition to explicit ART IIT status tags.
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block uppercase tracking-wide">
                Active Program Definitions:
              </span>
              <ul className="text-[10px] text-slate-500 space-y-1.5 list-disc pl-4 font-medium">
                <li><strong>OVC Status:</strong> Only Active status beneficiaries contribute to alerting modules.</li>
                <li><strong>Viral Load Eligibility:</strong> CALHIV stream or explicitly recorded HIV-Positive status.</li>
                <li><strong>BMI Assessment:</strong> Blank, null, or non-numeric height/weight entries for served cases.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD ALERT CARDS SUMMARY */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Active Clinical Alerts & Data Integrity Grid
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" id="alerts-cards-grid">
          {Object.entries(summary).map(([key, item]) => {
            const val = item as AlertDetail;
            const newCount = getNewAlertCount(key, val.count);

            // Styling variables based on alert status
            let cardStyle = "";
            let dotStyle = "";
            let textStyle = "";
            let badgeStyle = "";

            if (val.status === "complete") {
              cardStyle = "bg-emerald-50/50 border-emerald-300 hover:border-emerald-500 text-emerald-950";
              dotStyle = "bg-emerald-500";
              textStyle = "text-emerald-700";
              badgeStyle = "bg-emerald-100 text-emerald-800 border-emerald-300";
            } else if (val.status === "critical") {
              cardStyle = "bg-rose-50/40 border-rose-300 hover:border-rose-500 text-rose-950";
              dotStyle = "bg-rose-600 animate-pulse";
              textStyle = "text-rose-700";
              badgeStyle = "bg-rose-100 text-rose-800 border-rose-300";
            } else {
              cardStyle = "bg-orange-50/40 border-orange-300 hover:border-orange-500 text-orange-950";
              dotStyle = "bg-orange-500";
              textStyle = "text-orange-700";
              badgeStyle = "bg-orange-100 text-orange-800 border-orange-300";
            }

            // Map keys to drilldown type parameter
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

            return (
              <div
                key={key}
                onClick={() => onDrilldown(val.name, val.list, drilldownType)}
                className={`p-4 border rounded-lg shadow-xs cursor-pointer hover:shadow-md transition-all flex flex-col justify-between h-36 ${cardStyle}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${dotStyle}`}></span>
                    <span className="text-[11px] font-bold uppercase tracking-tight leading-tight block">
                      {val.name}
                    </span>
                  </div>
                  
                  {/* Optional new notification count badge */}
                  {newCount > 0 && (
                    <span className="bg-red-600 text-white font-mono font-bold text-[9px] px-1.5 py-0.5 rounded-full animate-bounce shrink-0 shadow-xs">
                      +{newCount} new
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <div className="flex items-baseline gap-1.5">
                    <h4 className="text-2xl font-extrabold font-mono leading-none">{val.count.toLocaleString()}</h4>
                    <span className="text-[10px] text-slate-500 font-semibold">Active OVCs</span>
                  </div>

                  <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-slate-200/50">
                    <span className="text-[10px] font-bold font-mono text-slate-500">
                      {val.percentage}% of cohort
                    </span>
                    <span className={`text-[9px] font-bold uppercase border px-1.5 py-0.5 rounded ${badgeStyle}`}>
                      {val.status === "complete" ? "🟢 Complete" : val.status === "critical" ? "🔴 Critical" : "🟠 Warning"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CLINICAL DEEP DIVE RECHARTS VISUALIZERS */}
      <div className="p-5 bg-white border border-slate-300 rounded shadow-xs space-y-4">
        
        {/* Deep Dive tabs bar */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileBarChart className="w-4 h-4 text-blue-600" />
            <h3 className="font-bold uppercase text-slate-800 text-xs tracking-wider">
              Cohort Analysis Visualizers & Trend Charts
            </h3>
          </div>

          <div className="flex bg-slate-100 p-1 rounded border border-slate-200 gap-1 text-[11px]">
            <button
              onClick={() => setActiveChartTab("unsuppressed")}
              className={`px-3 py-1.5 rounded font-bold cursor-pointer transition-colors ${
                activeChartTab === "unsuppressed"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Unsuppressed Analysis
            </button>
            <button
              onClick={() => setActiveChartTab("iit")}
              className={`px-3 py-1.5 rounded font-bold cursor-pointer transition-colors ${
                activeChartTab === "iit"
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              IIT Interruption Analysis
            </button>
          </div>
        </div>

        {/* Dynamic visual charts panel */}
        {activeChartTab === "unsuppressed" ? (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              
              {/* Unsuppressed by LGA */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between h-80">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  Unsuppressed Beneficiaries by LGA
                </h4>
                <div className="flex-1 min-h-0">
                  {unsuppressedCharts.lga.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={unsuppressedCharts.lga}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#ef4444" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                      No unsuppressed cases recorded
                    </div>
                  )}
                </div>
              </div>

              {/* Unsuppressed by Community */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between h-80">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-orange-500" />
                  Unsuppressed by Community (Top 10)
                </h4>
                <div className="flex-1 min-h-0">
                  {unsuppressedCharts.community.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={unsuppressedCharts.community}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#f97316" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                      No unsuppressed cases recorded
                    </div>
                  )}
                </div>
              </div>

              {/* Unsuppressed by CCW */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between h-80">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-blue-500" />
                  Unsuppressed by Deploying CCW Name (Top 10)
                </h4>
                <div className="flex-1 min-h-0">
                  {unsuppressedCharts.ccw.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={unsuppressedCharts.ccw}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                      No unsuppressed cases recorded
                    </div>
                  )}
                </div>
              </div>

              {/* Monthly Unsuppressed Trend */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between h-80">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  Monthly Unsuppressed Cohort Trend
                </h4>
                <div className="flex-1 min-h-0">
                  {unsuppressedCharts.trend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={unsuppressedCharts.trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                      No monthly trend available
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in" id="iit-charts-container">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              
              {/* IIT by LGA */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between h-80">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  IIT Cases by LGA
                </h4>
                <div className="flex-1 min-h-0">
                  {iitCharts.lga.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={iitCharts.lga}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#ef4444" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                      No IIT cases found in period
                    </div>
                  )}
                </div>
              </div>

              {/* IIT by Community */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between h-80">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-orange-500" />
                  IIT Cases by Community (Top 10)
                </h4>
                <div className="flex-1 min-h-0">
                  {iitCharts.community.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={iitCharts.community}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#f97316" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                      No IIT cases found in period
                    </div>
                  )}
                </div>
              </div>

              {/* IIT by CCW */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between h-80">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-blue-500" />
                  IIT Cases by CCW Name (Top 10)
                </h4>
                <div className="flex-1 min-h-0">
                  {iitCharts.ccw.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={iitCharts.ccw}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                      No IIT cases found in period
                    </div>
                  )}
                </div>
              </div>

              {/* Monthly IIT Trend */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded flex flex-col justify-between h-80">
                <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  Monthly IIT Cohort Trend
                </h4>
                <div className="flex-1 min-h-0">
                  {iitCharts.trend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={iitCharts.trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="month" stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold uppercase">
                      No monthly trend available
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>

    </div>
  );
}
