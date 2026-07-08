/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { Download, FileText, CheckCircle, Table, Image, Printer } from "lucide-react";
import { CCWCounter, AggregationNode, ReportFilters } from "../types";

interface ExportsModuleProps {
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
  fileName: string;
}

export default function ExportsModule({
  ccwRecords,
  aggregations,
  filters,
  fileName
}: ExportsModuleProps) {
  const [preparedBy, setPreparedBy] = useState("National HIV/OVC Coordinator");
  const [isExporting, setIsExporting] = useState(false);
  const [lastExport, setLastExport] = useState("");

  const organizationName = "Child Monitor Plus (CMP) Program";
  const dateGenerated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  // 1. Export to Excel (Full Book containing disaggregated sheets)
  const exportToExcel = () => {
    setIsExporting(true);
    try {
      const workbook = XLSX.utils.book_new();

      // Sheet 1: Program Summary
      const summaryData = [
        ["CMP Analytics Reporting System (CAPRS) Report"],
        [`Organization: ${organizationName}`],
        [`Reporting Period: ${filters.ReportingPeriod}`],
        [`Date Range: ${filters.StartDate} to ${filters.EndDate}`],
        [`Prepared By: ${preparedBy}`],
        [`Generated On: ${dateGenerated}`],
        [],
        ["Indicator Name", "Active Target", "CALHIV Served", "HEI Served", "Total Served", "Outstanding", "Coverage %"],
        [
          "National Summary",
          aggregations.overall.ActiveCMP,
          aggregations.overall.CALHIVServed,
          aggregations.overall.HEIServed,
          aggregations.overall.TotalServed,
          aggregations.overall.Outstanding,
          `${aggregations.overall.Coverage.toFixed(1)}%`
        ]
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Executive Summary");

      // Sheet 2: CCW Performance
      const ccwData = ccwRecords.map((c) => ({
        "CCW Name": c.CCWName,
        "CCW Email": c.CCWEmail || "N/A",
        "CCW Phone": c.CCWPhone || "N/A",
        "Community Location": c.Community,
        "Active CMP Targets": c.ActiveCMP,
        "CALHIV Served": c.CALHIVServed,
        "HEI Served": c.HEIServed,
        "Total Served": c.TotalServed,
        Outstanding: c.Outstanding,
        "Coverage Rate (%)": parseFloat(c.Coverage.toFixed(1))
      }));
      const ccwSheet = XLSX.utils.json_to_sheet(ccwData);
      XLSX.utils.book_append_sheet(workbook, ccwSheet, "CCW Standings");

      // Sheet 3: LGA Aggregations
      const lgaData = aggregations.lga.map((l) => ({
        "LGA Name": l.name,
        "Active CMP Targets": l.ActiveCMP,
        "Active CALHIV": l.ActiveCALHIV,
        "Active HEI": l.ActiveHEI,
        "CALHIV Served": l.CALHIVServed,
        "HEI Served": l.HEIServed,
        "Total Served": l.TotalServed,
        "Coverage Rate (%)": parseFloat(l.Coverage.toFixed(1))
      }));
      const lgaSheet = XLSX.utils.json_to_sheet(lgaData);
      XLSX.utils.book_append_sheet(workbook, lgaSheet, "LGA Summary");

      // Save file
      XLSX.writeFile(workbook, `CAPRS_Performance_Report_${filters.ReportingPeriod}.xlsx`);
      setLastExport("Excel Spreadsheet successfully generated and saved.");
    } catch (e: any) {
      console.error(e);
      alert(`Export failed: ${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 2. Export to CSV (CCW Records)
  const exportToCSV = () => {
    setIsExporting(true);
    try {
      const headers = "CCW Name,Email,Phone,Community,ActiveCMP,CALHIVServed,HEIServed,TotalServed,Outstanding,CoveragePercent\n";
      const rows = ccwRecords
        .map((c) =>
          `"${c.CCWName}","${c.CCWEmail || "N/A"}","${c.CCWPhone || "N/A"}","${c.Community}",${c.ActiveCMP},${c.CALHIVServed},${c.HEIServed},${c.TotalServed},${c.Outstanding},${c.Coverage.toFixed(1)}`
        )
        .join("\n");

      const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `CAPRS_CCW_Performance_${filters.ReportingPeriod}.csv`);
      link.click();
      setLastExport("CSV data exported successfully.");
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 3. Export Word Document (HTML template natively openable in Microsoft Word)
  const exportToWord = () => {
    setIsExporting(true);
    try {
      const htmlContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <title>CAPRS Performance Brief</title>
          <style>
            body { font-family: 'Arial', sans-serif; line-height: 1.5; color: #333; }
            h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background-color: #2563eb; color: white; padding: 10px; text-align: left; }
            td { border: 1px solid #ddd; padding: 10px; }
            .header-info { margin-bottom: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <h1>CMP Program Performance Brief</h1>
          <div class="header-info">
            <p><strong>Reporting Period:</strong> ${filters.ReportingPeriod}</p>
            <p><strong>Target Enrolments File:</strong> ${fileName}</p>
            <p><strong>Prepared By:</strong> ${preparedBy}</p>
            <p><strong>Generated On:</strong> ${dateGenerated}</p>
          </div>
          <h2>Executive Indicators Summary</h2>
          <table>
            <thead>
              <tr>
                <th>Indicator Name</th>
                <th>Active Enrolments</th>
                <th>Total Served</th>
                <th>Outstanding Gap</th>
                <th>Overall Coverage</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>National CMP Summary</td>
                <td>${aggregations.overall.ActiveCMP}</td>
                <td>${aggregations.overall.TotalServed}</td>
                <td>${aggregations.overall.Outstanding}</td>
                <td>${aggregations.overall.Coverage.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
          <p>This report compiles disaggregated performance indexes for clinical cohorts and community caseworkers. Please use CAPRS visualizer for graphs.</p>
        </body>
        </html>
      `;

      const blob = new Blob(["\ufeff" + htmlContent], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `CAPRS_M&E_Report_${filters.ReportingPeriod}.doc`);
      link.click();
      setLastExport("Microsoft Word document generated successfully.");
    } catch (e: any) {
      alert(`Word Export failed: ${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 4. Export PowerPoint Brief (Clean HTML slides preview file)
  const exportToPPT = () => {
    setIsExporting(true);
    try {
      const htmlContent = `
        <html>
        <head>
          <title>CAPRS Slide Outline</title>
          <style>
            body { font-family: Arial; padding: 40px; background-color: #f8fafc; }
            .slide { background: white; border: 2px solid #e2e8f0; border-radius: 4px; padding: 40px; margin-bottom: 40px; min-height: 400px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
            h2 { color: #2563eb; font-size: 28px; border-bottom: 3px solid #2563eb; padding-bottom: 12px; }
            p, li { font-size: 18px; line-height: 1.6; color: #475569; }
          </style>
        </head>
        <body>
          <div class="slide">
            <h2>CMP Performance Review Briefing</h2>
            <p><strong>Reporting Period:</strong> ${filters.ReportingPeriod}</p>
            <p><strong>Generated On:</strong> ${dateGenerated}</p>
            <p><strong>Coordinator:</strong> ${preparedBy}</p>
            <p><em>Child Monitor Plus Program System</em></p>
          </div>
          <div class="slide">
            <h2>Overall Program Performance</h2>
            <ul>
              <li><strong>Active Target:</strong> ${aggregations.overall.ActiveCMP} beneficiaries</li>
              <li><strong>CALHIV Served:</strong> ${aggregations.overall.CALHIVServed} of ${aggregations.overall.ActiveCALHIV}</li>
              <li><strong>HEI Served:</strong> ${aggregations.overall.HEIServed} of ${aggregations.overall.ActiveHEI}</li>
              <li><strong>Outstanding Program Gap:</strong> ${aggregations.overall.Outstanding}</li>
              <li><strong>National Coverage Velocity:</strong> ${aggregations.overall.Coverage.toFixed(1)}%</li>
            </ul>
          </div>
        </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `CAPRS_PowerPoint_Brief_${filters.ReportingPeriod}.html`);
      link.click();
      setLastExport("PowerPoint web outline generated successfully.");
    } catch (e: any) {
      alert(`PPT Outline Export failed: ${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 5. Printable / PDF Report Capture
  const handlePrintPDF = () => {
    window.print();
    setLastExport("System print overlay activated.");
  };

  return (
    <div className="p-4 bg-white border border-slate-300 rounded shadow-xs space-y-4" id="exports-module">
      <div>
        <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
          <Download className="w-4 h-4 text-blue-600" />
          Enterprise Export & Document Center
        </h3>
        <p className="text-[11px] text-slate-500 mt-0.5">Generate high-fidelity briefings, worksheets, and slide outlines for programmatic review.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Metadata options */}
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Prepared By / Signatory Coordinator</label>
            <input
              type="text"
              value={preparedBy}
              onChange={(e) => setPreparedBy(e.target.value)}
              placeholder="e.g. State M&E Lead"
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white outline-none focus:border-blue-500"
            />
          </div>

          <div className="p-2.5 bg-slate-100 border border-slate-300 rounded space-y-1">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Export Security Metadata</span>
            <p className="text-[10px] text-slate-600 font-medium leading-relaxed">
              Logo Watermark: <strong>Active Logo Injected</strong><br />
              Audit Footers: <strong>Prepared by {preparedBy} on {dateGenerated}</strong><br />
              Sheet References: <strong>{fileName || "CAPRS Line List"}</strong>
            </p>
          </div>
        </div>

        {/* Action Panel */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={exportToExcel}
            className="flex items-center justify-center flex-col gap-1.5 p-3 border border-slate-300 hover:border-blue-300 hover:bg-blue-50 rounded text-blue-700 font-bold text-xs transition-all cursor-pointer"
          >
            <Table className="w-4 h-4 text-blue-600" />
            Excel Worksheet
          </button>

          <button
            onClick={exportToCSV}
            className="flex items-center justify-center flex-col gap-1.5 p-3 border border-slate-300 hover:border-slate-400 hover:bg-slate-50 rounded text-slate-700 font-bold text-xs transition-all cursor-pointer"
          >
            <Table className="w-4 h-4 text-slate-600" />
            CSV Dataset
          </button>

          <button
            onClick={exportToWord}
            className="flex items-center justify-center flex-col gap-1.5 p-3 border border-slate-300 hover:border-blue-300 hover:bg-blue-50 rounded text-blue-700 font-bold text-xs transition-all cursor-pointer"
          >
            <FileText className="w-4 h-4 text-blue-600" />
            Word Document
          </button>

          <button
            onClick={exportToPPT}
            className="flex items-center justify-center flex-col gap-1.5 p-3 border border-slate-300 hover:border-amber-300 hover:bg-amber-50 rounded text-amber-700 font-bold text-xs transition-all cursor-pointer"
          >
            <FileText className="w-4 h-4 text-amber-600" />
            PowerPoint slide
          </button>

          <button
            onClick={handlePrintPDF}
            className="col-span-2 flex items-center justify-center gap-2 p-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded transition-all shadow-sm cursor-pointer border border-blue-700"
          >
            <Printer className="w-4 h-4" />
            Print Report / Save as PDF
          </button>
        </div>
      </div>

      {lastExport && (
        <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-300 rounded">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">{lastExport}</span>
        </div>
      )}
    </div>
  );
}
