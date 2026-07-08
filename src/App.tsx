/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard,
  TableProperties,
  FilePieChart,
  Download,
  Brain,
  ShieldCheck,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  FolderOpen,
  Calendar,
  Layers
} from "lucide-react";
import {
  Beneficiary,
  CCWCounter,
  AggregationNode,
  ReportingPeriod,
  ReportFilters,
  DataQualitySummary,
  ValidationResult
} from "./types";
import {
  normalizeBeneficiary,
  generatePerformanceReport,
  runDataQualityCheck,
  parseDate
} from "./utils/reportingEngine";

// Components
import ImportModule from "./components/ImportModule";
import DashboardView from "./components/DashboardView";
import ReportsView from "./components/ReportsView";
import ChartsView from "./components/ChartsView";
import ExportsModule from "./components/ExportsModule";
import AINarrativesView from "./components/AINarrativesView";
import TestingView from "./components/TestingView";

const INITIAL_FILTERS: ReportFilters = {
  State: "",
  LGA: "",
  Ward: "",
  Community: "",
  CCW: "",
  Sex: "",
  AgeMin: null,
  AgeMax: null,
  OVCStatus: "Active",
  EnrolmentStream: "All",
  ReportingPeriod: ReportingPeriod.MONTHLY,
  StartDate: "",
  EndDate: ""
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "reports" | "charts" | "exports" | "ai" | "testing">("dashboard");
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filters, setFilters] = useState<ReportFilters>(INITIAL_FILTERS);
  const [targetDate, setTargetDate] = useState<Date>(new Date(2026, 5, 15)); // Default to June 15, 2026

  // 1. Raw Excel parser callback: processes rows, normalizes and detects date anchors
  const handleDataLoaded = (rawRows: any[], name: string) => {
    setIsLoading(true);
    setFileName(name);

    setTimeout(() => {
      try {
        const list = rawRows.map((row, idx) => normalizeBeneficiary(row, idx));
        setBeneficiaries(list);

        // Auto-detect the absolute latest service date to use as report target date
        let latestDate: Date | null = null;
        list.forEach((b) => {
          const d = parseDate(b.DateOfLatestServiceProvided);
          if (d) {
            if (!latestDate || d.getTime() > latestDate.getTime()) {
              latestDate = d;
            }
          }
        });

        const activeTargetDate = latestDate || new Date(2026, 5, 15); // Fallback to June 15, 2026
        setTargetDate(activeTargetDate);

        // Pre-configure start and end date ranges for Custom Period of the filters
        const year = activeTargetDate.getFullYear();
        const monthNum = String(activeTargetDate.getMonth() + 1).padStart(2, "0");
        const daysInMonth = new Date(year, activeTargetDate.getMonth() + 1, 0).getDate();

        setFilters((prev) => ({
          ...prev,
          StartDate: `${year}-${monthNum}-01`,
          EndDate: `${year}-${monthNum}-${daysInMonth}`
        }));
        
        setActiveTab("dashboard");
      } catch (e) {
        console.error("Data normalization failed:", e);
      } finally {
        setIsLoading(false);
      }
    }, 100);
  };

  // 2. Data Quality Logs calculations (Run once upon beneficiaries change)
  const dataQualitySummary = useMemo(() => {
    if (beneficiaries.length === 0) {
      return { totalRecords: 0, duplicateVcIds: 0, blankCcws: 0, blankCommunities: 0, blankLgas: 0, blankWards: 0, invalidDates: 0, issues: [] };
    }
    return runDataQualityCheck(beneficiaries);
  }, [beneficiaries]);

  // 3. Performance Aggregates compiler (recomputes instantly on filters or dataset changes)
  const reportResults = useMemo(() => {
    return generatePerformanceReport(beneficiaries, filters, targetDate);
  }, [beneficiaries, filters, targetDate]);

  // 4. Dynamic Filter list generation based on current loaded dataset
  const filterOptions = useMemo(() => {
    const list = beneficiaries;
    const states = Array.from(new Set(list.map((b) => b.State).filter(Boolean))).sort();
    
    const lgas = Array.from(
      new Set(
        list
          .filter((b) => !filters.State || b.State === filters.State)
          .map((b) => b.LGA)
          .filter(Boolean)
      )
    ).sort();

    const wards = Array.from(
      new Set(
        list
          .filter((b) => !filters.State || b.State === filters.State)
          .filter((b) => !filters.LGA || b.LGA === filters.LGA)
          .map((b) => b.Ward)
          .filter(Boolean)
      )
    ).sort();

    const communities = Array.from(
      new Set(
        list
          .filter((b) => !filters.State || b.State === filters.State)
          .filter((b) => !filters.LGA || b.LGA === filters.LGA)
          .filter((b) => !filters.Ward || b.Ward === filters.Ward)
          .map((b) => b.Community)
          .filter(Boolean)
      )
    ).sort();

    const ccws = Array.from(
      new Set(
        list
          .filter((b) => !filters.State || b.State === filters.State)
          .filter((b) => !filters.LGA || b.LGA === filters.LGA)
          .filter((b) => !filters.Ward || b.Ward === filters.Ward)
          .filter((b) => !filters.Community || b.Community === filters.Community)
          .map((b) => b.CCWName)
          .filter(Boolean)
      )
    ).sort();

    return { states, lgas, wards, communities, ccws };
  }, [beneficiaries, filters.State, filters.LGA, filters.Ward, filters.Community]);

  // Debug Logging Effect for verification
  useEffect(() => {
    if (beneficiaries.length > 0) {
      const overall = reportResults.aggregations.overall;
      console.log("=========================================");
      console.log("CMP DATA IMPORT DEBUG LOG");
      console.log("=========================================");
      console.log(`Total Active CALHIV: ${overall.ActiveCALHIV.toLocaleString()}`);
      console.log(`Total Active HEI: ${overall.ActiveHEI.toLocaleString()}`);
      console.log(`CALHIV Served: ${overall.CALHIVServed.toLocaleString()}`);
      console.log(`HEI Served: ${overall.HEIServed.toLocaleString()}`);
      console.log("=========================================");
    }
  }, [beneficiaries, reportResults]);

  // Reset filter helpers
  const handleResetFilters = () => {
    setFilters({
      ...INITIAL_FILTERS,
      StartDate: filters.StartDate,
      EndDate: filters.EndDate
    });
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-900 flex flex-col font-sans" id="caprs-root">
      {/* Upper Navigation Bar */}
      <header className="h-14 bg-slate-900 text-white flex items-center justify-between px-6 shrink-0 shadow-lg sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-lg text-white shrink-0">
            C
          </div>
          <h1 className="text-sm md:text-base font-bold tracking-tight uppercase">
            CAPRS <span className="font-light opacity-60 text-xs italic ml-1 hidden sm:inline">Analytics & Performance Reporting System</span>
          </h1>
        </div>

        {/* Loaded Dataset Status banner */}
        {beneficiaries.length > 0 ? (
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="font-medium max-w-[200px] truncate">Dataset: {fileName}</span>
              <span className="opacity-60">({beneficiaries.length.toLocaleString()} Records)</span>
            </div>
            <div className="hidden md:block bg-slate-800 px-2.5 py-0.5 rounded border border-slate-700 font-mono text-[11px] text-emerald-400">
              ENGINE STATUS: VALIDATED
            </div>
            <button
              onClick={() => { setBeneficiaries([]); setFileName(""); }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded border border-slate-700 text-[10px] font-bold cursor-pointer transition-colors"
            >
              Reset
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
              <span className="font-medium">DATABASE STATUS: OFFLINE</span>
            </div>
            <div className="hidden md:block bg-slate-800 px-2.5 py-0.5 rounded border border-slate-700 font-mono text-[11px] text-slate-500">
              ENGINE STATUS: UNLOADED
            </div>
          </div>
        )}
      </header>

      {beneficiaries.length === 0 ? (
        // Database File Ingestion State
        <div className="flex-1 flex items-center justify-center p-6 min-h-[500px]">
          <ImportModule
            onDataLoaded={handleDataLoaded}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          />
        </div>
      ) : (
        // Fully interactive Dashboard Space
        <div className="flex flex-1 flex-col md:flex-row overflow-hidden">
          
          {/* Sidebar Navigation & Global Filters */}
          <aside className="w-full md:w-60 bg-slate-100 border-r border-slate-300 flex flex-col p-4 shrink-0 overflow-y-auto">
            
            {/* Navigation Group */}
            <div className="mb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Navigation</p>
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeTab === "dashboard"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  BI Dashboard
                </button>

                <button
                  onClick={() => setActiveTab("reports")}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeTab === "reports"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <TableProperties className="w-3.5 h-3.5" />
                  Analytical Reports
                </button>

                <button
                  onClick={() => setActiveTab("charts")}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeTab === "charts"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <FilePieChart className="w-3.5 h-3.5" />
                  Performance Charts
                </button>

                <button
                  onClick={() => setActiveTab("ai")}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeTab === "ai"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Brain className="w-3.5 h-3.5" />
                  AI Narrative Review
                </button>

                <button
                  onClick={() => setActiveTab("exports")}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeTab === "exports"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  Document Exports
                </button>

                <button
                  onClick={() => setActiveTab("testing")}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-2 ${
                    activeTab === "testing"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Automated Testing
                </button>
              </nav>
            </div>

            {/* Global Filters Group */}
            <div className="border-t border-slate-300 pt-3 mt-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Filters</p>
                <button
                  onClick={handleResetFilters}
                  className="text-[9px] font-bold text-slate-500 hover:text-blue-600 uppercase tracking-wider"
                >
                  Clear All
                </button>
              </div>

              <div className="space-y-3 text-xs">
                {/* State Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">State</label>
                  <select
                    value={filters.State}
                    onChange={(e) => setFilters({ ...filters, State: e.target.value, LGA: "", Ward: "", Community: "", CCW: "" })}
                    className="w-full bg-white border border-slate-300 text-xs rounded p-1 focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    <option value="">All States</option>
                    {filterOptions.states.map((s, idx) => (
                      <option key={idx} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* LGA Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">LGA</label>
                  <select
                    value={filters.LGA}
                    onChange={(e) => setFilters({ ...filters, LGA: e.target.value, Ward: "", Community: "", CCW: "" })}
                    disabled={!filters.State}
                    className="w-full bg-white border border-slate-300 text-xs rounded p-1 focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-50"
                  >
                    <option value="">All LGAs</option>
                    {filterOptions.lgas.map((l, idx) => (
                      <option key={idx} value={l}>{l}</option>
                    ))}
                  </select>
                </div>

                {/* Ward Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Ward</label>
                  <select
                    value={filters.Ward}
                    onChange={(e) => setFilters({ ...filters, Ward: e.target.value, Community: "", CCW: "" })}
                    disabled={!filters.LGA}
                    className="w-full bg-white border border-slate-300 text-xs rounded p-1 focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-50"
                  >
                    <option value="">All Wards</option>
                    {filterOptions.wards.map((w, idx) => (
                      <option key={idx} value={w}>{w}</option>
                    ))}
                  </select>
                </div>

                {/* Community Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Community</label>
                  <select
                    value={filters.Community}
                    onChange={(e) => setFilters({ ...filters, Community: e.target.value, CCW: "" })}
                    disabled={!filters.Ward}
                    className="w-full bg-white border border-slate-300 text-xs rounded p-1 focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-50"
                  >
                    <option value="">All Communities</option>
                    {filterOptions.communities.map((c, idx) => (
                      <option key={idx} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* CCW Filter */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">CCW</label>
                  <select
                    value={filters.CCW}
                    onChange={(e) => setFilters({ ...filters, CCW: e.target.value })}
                    disabled={!filters.Community}
                    className="w-full bg-white border border-slate-300 text-xs rounded p-1 focus:ring-1 focus:ring-blue-500 outline-none disabled:opacity-50"
                  >
                    <option value="">All CCWs</option>
                    {filterOptions.ccws.map((c, idx) => (
                      <option key={idx} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Sex & OVC Status */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Sex</label>
                    <select
                      value={filters.Sex}
                      onChange={(e) => setFilters({ ...filters, Sex: e.target.value })}
                      className="w-full bg-white border border-slate-300 text-xs rounded p-1 focus:ring-1 focus:ring-blue-500 outline-none"
                    >
                      <option value="">All</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">OVC Status</label>
                    <select
                      value={filters.OVCStatus}
                      onChange={(e) => setFilters({ ...filters, OVCStatus: e.target.value })}
                      className="w-full bg-white border border-slate-300 text-xs rounded p-1 focus:ring-1 focus:ring-blue-500 outline-none"
                    >
                      <option value="Active">Active</option>
                      <option value="All">All</option>
                    </select>
                  </div>
                </div>

                {/* Enrolment Stream */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Cohort Stream</label>
                  <select
                    value={filters.EnrolmentStream}
                    onChange={(e) => setFilters({ ...filters, EnrolmentStream: e.target.value })}
                    className="w-full bg-white border border-slate-300 text-xs rounded p-1 focus:ring-1 focus:ring-blue-500 outline-none"
                  >
                    <option value="All">All Streams</option>
                    <option value="CALHIV">CALHIV Only</option>
                    <option value="HEI">HEI Only</option>
                  </select>
                </div>

                {/* Reporting Period */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Reporting Period</label>
                  <select
                    value={filters.ReportingPeriod}
                    onChange={(e) => setFilters({ ...filters, ReportingPeriod: e.target.value as ReportingPeriod })}
                    className="w-full bg-white border border-slate-300 text-xs rounded p-1 focus:ring-1 focus:ring-blue-500 outline-none font-bold text-blue-700"
                  >
                    {Object.values(ReportingPeriod).map((p, idx) => (
                      <option key={idx} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Custom Date Range selectors */}
                {filters.ReportingPeriod === ReportingPeriod.CUSTOM && (
                  <div className="grid grid-cols-2 gap-1.5 animate-fade-in pt-1">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Start</label>
                      <input
                        type="date"
                        value={filters.StartDate}
                        onChange={(e) => setFilters({ ...filters, StartDate: e.target.value })}
                        className="w-full bg-white border border-slate-300 text-[10px] rounded p-0.5 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">End</label>
                      <input
                        type="date"
                        value={filters.EndDate}
                        onChange={(e) => setFilters({ ...filters, EndDate: e.target.value })}
                        className="w-full bg-white border border-slate-300 text-[10px] rounded p-0.5 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Print action footer inside sidebar */}
            <div className="mt-auto border-t border-slate-300 pt-3">
              <button
                onClick={() => window.print()}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 text-white py-1.5 rounded text-[11px] font-bold hover:bg-black transition-colors shadow-sm"
              >
                <PrinterIcon className="w-3 h-3 text-emerald-400" />
                PRINT BRIEFING
              </button>
            </div>
          </aside>

          {/* Central Workspace area */}
          <main className="flex-1 p-5 space-y-5 flex flex-col overflow-y-auto">
            {/* Content panel renderer with swift transitions */}
            <div className="flex-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.1 }}
                >
                  {activeTab === "dashboard" && (
                    <DashboardView
                      ccwRecords={reportResults.ccwRecords}
                      aggregations={reportResults.aggregations}
                      validation={reportResults.validation}
                      selectedPeriod={filters.ReportingPeriod}
                      beneficiaries={beneficiaries}
                    />
                  )}

                  {activeTab === "reports" && (
                    <ReportsView
                      beneficiaries={beneficiaries}
                      ccwRecords={reportResults.ccwRecords}
                      aggregations={reportResults.aggregations}
                      filters={filters}
                      setFilters={setFilters}
                      dataQualitySummary={dataQualitySummary}
                      targetDate={targetDate}
                    />
                  )}

                  {activeTab === "charts" && (
                    <ChartsView
                      ccwRecords={reportResults.ccwRecords}
                      aggregations={reportResults.aggregations}
                      selectedPeriod={filters.ReportingPeriod}
                    />
                  )}

                  {activeTab === "exports" && (
                    <ExportsModule
                      ccwRecords={reportResults.ccwRecords}
                      aggregations={reportResults.aggregations}
                      filters={filters}
                      fileName={fileName}
                      beneficiaries={beneficiaries}
                      targetDate={targetDate}
                      setFilters={setFilters}
                    />
                  )}

                  {activeTab === "ai" && (
                    <AINarrativesView
                      ccwRecords={reportResults.ccwRecords}
                      aggregations={reportResults.aggregations}
                      filters={filters}
                    />
                  )}

                  {activeTab === "testing" && (
                    <TestingView />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer Quality Log */}
            <footer className="shrink-0 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-500 border-t border-slate-300 pt-3 gap-2 uppercase tracking-wide">
              <div className="flex gap-4">
                <span>Engine: Business Rules v1.02 Applied</span>
                <span>|</span>
                <span className="text-emerald-600 font-bold">Calculations: Verified ✓</span>
              </div>
              <div className="font-mono">Generated: {new Date().toISOString().replace('T', ' ').slice(0, 19)} | Prepared by: M&E Lead</div>
            </footer>
          </main>
        </div>
      )}
    </div>
  );
}

// Simple internal icon helper for printable trigger
function PrinterIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      className={props.className}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4" />
    </svg>
  );
}
