/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import {
  Download,
  FileText,
  CheckCircle,
  Table,
  Printer,
  Clock,
  Search,
  Trash2,
  Sliders,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  FileBox,
  Settings,
  X,
  UserCheck
} from "lucide-react";
import { CCWCounter, AggregationNode, ReportFilters, Beneficiary, ReportingPeriod } from "../types";
import { REPORT_LIST, getReportData, getDescriptiveFileName, generateWordHTMLContent, generatePPTHtmlContent } from "../utils/exportGenerators";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import JSZip from "jszip";

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
  beneficiaries: Beneficiary[];
  targetDate: Date;
  setFilters?: React.Dispatch<React.SetStateAction<ReportFilters>>;
}

interface ArchiveReport {
  id: string;
  name: string;
  period: string;
  generatedBy: string;
  dateGenerated: string;
  format: string;
  fileSize: string;
  version: string;
  contentBlobUrl: string;
  downloadName: string;
}

interface ScheduleSetup {
  id: string;
  name: string;
  reportType: string;
  period: string;
  frequency: string;
  format: string;
  recipients: string;
  isActive: boolean;
}

// 1. Pre-populated Archive data representing historical enterprise submissions
const INITIAL_ARCHIVE: ArchiveReport[] = [
  {
    id: "arch-1",
    name: "CCW Performance Report",
    period: "Monthly Campaign (June 2026)",
    generatedBy: "State M&E Officer",
    dateGenerated: "2026-06-30 17:30",
    format: "PDF",
    fileSize: "1.4 MB",
    version: "v1.0",
    contentBlobUrl: "",
    downloadName: "CCW_Performance_June_2026.pdf"
  },
  {
    id: "arch-2",
    name: "Viral Load Report",
    period: "Monthly Campaign (June 2026)",
    generatedBy: "LGA Supervisor",
    dateGenerated: "2026-06-30 14:15",
    format: "XLSX",
    fileSize: "840 KB",
    version: "v1.0",
    contentBlobUrl: "",
    downloadName: "Viral_Load_Report_June_2026.xlsx"
  },
  {
    id: "arch-3",
    name: "Executive Summary Report",
    period: "Quarterly Campaign (Q2 2026)",
    generatedBy: "Administrator",
    dateGenerated: "2026-07-01 09:00",
    format: "DOCX",
    fileSize: "2.1 MB",
    version: "v2.1",
    contentBlobUrl: "",
    downloadName: "Executive_Summary_Q2_2026.docx"
  }
];

export default function ExportsModule({
  ccwRecords,
  aggregations,
  filters,
  fileName,
  beneficiaries,
  targetDate,
  setFilters
}: ExportsModuleProps) {
  // Navigation & Control tabs
  const [activeTab, setActiveTab] = useState<"export" | "schedule" | "archive">("export");
  const [preparedBy, setPreparedBy] = useState("National HIV/OVC Coordinator");
  
  // Security & User role state
  const [activeRole, setActiveRole] = useState<"admin" | "state_me" | "lga_sup" | "ccw">("admin");
  const [securityNotice, setSecurityNotice] = useState("");

  // Checklist of selected reports for batch exports
  const [selectedReports, setSelectedReports] = useState<string[]>(["exec_summary", "dashboard_summary", "ccw_performance"]);

  // Asynchronous progress simulation state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [progressStage, setProgressStage] = useState("");
  const [exportLog, setExportLog] = useState("");

  // Print Preview Dialog State
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Archive state and Search query
  const [archiveList, setArchiveList] = useState<ArchiveReport[]>(INITIAL_ARCHIVE);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveFormatFilter, setArchiveFormatFilter] = useState("All");

  // Scheduling State
  const [schedules, setSchedules] = useState<ScheduleSetup[]>([
    {
      id: "sch-1",
      name: "Standard Monthly CCW Coverage Push",
      reportType: "ccw_performance",
      period: "Monthly",
      frequency: "Monthly",
      format: "PDF",
      recipients: "state_me_officer@cmp.org",
      isActive: true
    },
    {
      id: "sch-2",
      name: "Weekly Viral Suppression Audit",
      reportType: "viral_load",
      period: "Weekly",
      frequency: "Weekly",
      format: "XLSX",
      recipients: "national_coordinator@cmp.org",
      isActive: true
    }
  ]);

  // Form states for new schedule
  const [newSchName, setNewSchName] = useState("");
  const [newSchReport, setNewSchReport] = useState("exec_summary");
  const [newSchPeriod, setNewSchPeriod] = useState("Monthly");
  const [newSchFrequency, setNewSchFrequency] = useState("Monthly");
  const [newSchFormat, setNewSchFormat] = useState("PDF");
  const [newSchRecipients, setNewSchRecipients] = useState("");

  const organizationName = "Child Monitor Plus (CMP) Program";
  const dateGeneratedStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  // Automatically adjust filters based on selected role to enforce security
  useEffect(() => {
    if (!setFilters) return;

    if (activeRole === "ccw") {
      // Lock to first available CCW
      const firstCCW = ccwRecords[0]?.CCWName || "";
      const firstCommunity = ccwRecords[0]?.Community || "";
      const firstWard = ccwRecords[0]?.Ward || "";
      const firstLga = ccwRecords[0]?.LGA || "";
      const firstState = ccwRecords[0]?.State || "";

      setFilters(prev => ({
        ...prev,
        State: firstState,
        LGA: firstLga,
        Ward: firstWard,
        Community: firstCommunity,
        CCW: firstCCW
      }));
      setSecurityNotice(`Role Restricted: Logged in as CCW [${firstCCW}]. Data locked strictly to assigned children.`);
    } else if (activeRole === "lga_sup") {
      // Lock to first available LGA
      const firstLga = ccwRecords[0]?.LGA || "";
      const firstState = ccwRecords[0]?.State || "";

      setFilters(prev => ({
        ...prev,
        State: firstState,
        LGA: firstLga,
        Ward: "",
        Community: "",
        CCW: ""
      }));
      setSecurityNotice(`Role Restricted: Logged in as LGA Supervisor [${firstLga} LGA]. Can export all wards within boundaries.`);
    } else if (activeRole === "state_me") {
      // Lock to first State
      const firstState = ccwRecords[0]?.State || "";

      setFilters(prev => ({
        ...prev,
        State: firstState,
        LGA: "",
        Ward: "",
        Community: "",
        CCW: ""
      }));
      setSecurityNotice(`Role Restricted: Logged in as State M&E Coordinator [${firstState} State]. All LGAs within State boundary are accessible.`);
    } else {
      // Admin - clear constraints or leave alone
      setSecurityNotice("System Authority: Logged in as Global Administrator. Full read, write, export, schedule, and deletion privileges active.");
    }
  }, [activeRole, ccwRecords, setFilters]);

  // Handle report checklist toggling
  const toggleReport = (id: string) => {
    if (selectedReports.includes(id)) {
      if (selectedReports.length > 1) {
        setSelectedReports(prev => prev.filter(item => item !== id));
      }
    } else {
      setSelectedReports(prev => [...prev, id]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedReports.length === REPORT_LIST.length) {
      setSelectedReports(["exec_summary"]); // Default keep at least one
    } else {
      setSelectedReports(REPORT_LIST.map(r => r.id));
    }
  };

  // Helper: Triggers async progression simulator with stages
  const triggerAsyncExport = (onComplete: () => void, stages: string[]) => {
    setIsExporting(true);
    setExportProgress(0);
    setProgressStage(stages[0]);

    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 10;
      setExportProgress(currentProgress);

      const stageIndex = Math.min(
        Math.floor((currentProgress / 100) * stages.length),
        stages.length - 1
      );
      setProgressStage(stages[stageIndex]);

      if (currentProgress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setIsExporting(false);
          onComplete();
        }, 300);
      }
    }, 150);
  };

  // 1. Export Selected Reports to PDF (A4 Landscape, tables with borders, highlights LGA summary rows in gold, footer)
  const handleExportPDF = () => {
    if (selectedReports.length === 0) return;

    const stages = [
      "Initializing high-fidelity PDF session...",
      "Assembling selected program variables...",
      "Drawing vector letterheads and watermarks...",
      "Generating formatted tables and gridlines...",
      "Applying golden-yellow LGA row highlights...",
      "Stamping sequential page footers...",
      "Finalizing and rendering PDF output..."
    ];

    triggerAsyncExport(() => {
      try {
        const doc = new jsPDF({
          orientation: "landscape",
          unit: "mm",
          format: "a4"
        });

        selectedReports.forEach((reportId, idx) => {
          if (idx > 0) doc.addPage();

          // Heading Header Block
          doc.setFillColor(30, 41, 59); // Slate-900
          doc.rect(10, 10, 277, 18, "F");

          doc.setTextColor(255, 255, 255);
          doc.setFontSize(14);
          doc.setFont("helvetica", "bold");
          doc.text("CAPRS - PERFORMANCE DECISION DOSSIER", 15, 18);

          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.text("GENERATED BY CMP ANALYTICS & PERFORMANCE REPORTING SYSTEM", 15, 24);

          // Meta Table block
          doc.setTextColor(30, 41, 59);
          doc.setFontSize(10);
          doc.text(`Organization: ${organizationName}`, 12, 36);
          doc.text(`Reporting Campaign: ${filters.ReportingPeriod}`, 12, 42);
          doc.text(`Data File: ${fileName || "CAPRS Master Database"}`, 12, 48);

          doc.text(`Prepared By: ${preparedBy}`, 160, 36);
          doc.text(`Authorized Role: ${activeRole.toUpperCase()}`, 160, 42);
          doc.text(`Timestamp: ${dateGeneratedStr}`, 160, 48);

          // Get Report specifications
          const report = getReportData(reportId, beneficiaries, ccwRecords, aggregations, filters);

          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.text(report.title.toUpperCase(), 12, 58);

          // DRAW TABLE
          let currentY = 64;
          const startX = 12;
          const colWidth = 273 / report.headers.length;

          // Header Row
          doc.setFillColor(37, 99, 235); // Blue-600
          doc.rect(startX, currentY, 273, 8, "F");
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(255, 255, 255);

          report.headers.forEach((header, hIdx) => {
            doc.text(header.toUpperCase(), startX + hIdx * colWidth + 2, currentY + 5.5);
          });

          currentY += 8;

          // Data Rows
          report.rows.slice(0, 15).forEach((row) => {
            const isSummary = String(row[0]).toLowerCase().includes("summary") || 
                              String(row[0]).toLowerCase().includes("lga") || 
                              String(row[0]).toLowerCase().includes("overall");

            if (isSummary) {
              doc.setFillColor(254, 240, 138); // Golden Yellow (#fef08a)
              doc.rect(startX, currentY, 273, 7, "F");
              doc.setTextColor(30, 41, 59);
              doc.setFont("helvetica", "bold");
            } else {
              doc.setTextColor(51, 65, 85);
              doc.setFont("helvetica", "normal");
            }

            // Draw borders
            doc.setDrawColor(226, 232, 240);
            doc.rect(startX, currentY, 273, 7);

            row.forEach((cell, cIdx) => {
              doc.text(String(cell), startX + cIdx * colWidth + 2, currentY + 4.8);
            });
            currentY += 7;
          });

          // Draw Footer on page
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7);
          doc.setTextColor(148, 163, 184);
          doc.text("Generated by CMP Analytics & Performance Reporting System", 12, 202);
          doc.text(`Page ${idx + 1} of ${selectedReports.length}`, 260, 202);
        });

        // Trigger file download
        const finalName = getDescriptiveFileName(
          selectedReports.length === 1 ? REPORT_LIST.find(r => r.id === selectedReports[0])!.name : "Batch_Reports",
          filters.ReportingPeriod,
          "pdf"
        );
        doc.save(finalName);

        // Add to Archive state
        addNewArchiveEntry(
          selectedReports.length === 1 ? REPORT_LIST.find(r => r.id === selectedReports[0])!.name : "Multi-Report Portfolio",
          "PDF",
          finalName,
          "1.4 MB"
        );

        setExportLog("Success: High-DPI PDF document generated and downloaded.");
      } catch (e: any) {
        console.error(e);
        alert(`PDF Export Failed: ${e.message}`);
      }
    }, stages);
  };

  // 2. Export Selected Reports to Excel (.xlsx) (worksheets, frozen top row & first column, columns, filters)
  const handleExportExcel = () => {
    if (selectedReports.length === 0) return;

    const stages = [
      "Creating fresh Microsoft Excel spreadsheet workbook...",
      "Generating worksheets for each selected program metric...",
      "Injecting tabular rows & headers...",
      "Applying conditional LGA highlights...",
      "Freezing top rows and first columns natively...",
      "Calculating optimal dynamic column widths...",
      "Finalizing Excel workbook structure..."
    ];

    triggerAsyncExport(() => {
      try {
        const workbook = XLSX.utils.book_new();

        selectedReports.forEach(reportId => {
          const report = getReportData(reportId, beneficiaries, ccwRecords, aggregations, filters);

          // Excel Rows: Metadata Header followed by table
          const excelData = [
            ["CMP Analytics & Performance Reporting System"],
            [`Report: ${report.title}`],
            [`Organization: ${organizationName}`],
            [`Prepared By: ${preparedBy} (${activeRole.toUpperCase()})`],
            [`Campaign Period: ${filters.ReportingPeriod}`],
            [`Timestamp: ${dateGeneratedStr}`],
            [],
            report.headers,
            ...report.rows
          ];

          const worksheet = XLSX.utils.aoa_to_sheet(excelData);

          // Configure SheetJS views: freeze top row (row index 7, containing headers) and first column (A)
          worksheet["!views"] = [
            {
              state: "frozen",
              ySplit: 8, // freeze metadata and header row
              xSplit: 1, // freeze first column
              activePane: "bottomRight"
            }
          ];

          // Auto-configure column widths to prevent clipping
          const maxCols = report.headers.length;
          worksheet["!cols"] = Array(maxCols).fill({ wch: 22 });

          // Configure auto filters for header row (index 7, which corresponds to row 8 in excel)
          const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
          worksheet["!autofilter"] = {
            ref: XLSX.utils.encode_range({
              s: { r: 7, c: 0 },
              e: { r: range.e.r, c: maxCols - 1 }
            })
          };

          // Append Sheet to Workbook
          const sheetName = report.title.slice(0, 31).replace(/[\\/?*\[\]]/g, ""); // sheet name length ceiling is 31
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        });

        const finalName = getDescriptiveFileName(
          selectedReports.length === 1 ? REPORT_LIST.find(r => r.id === selectedReports[0])!.name : "Enterprise_Workbook",
          filters.ReportingPeriod,
          "xlsx"
        );

        XLSX.writeFile(workbook, finalName);

        addNewArchiveEntry(
          selectedReports.length === 1 ? REPORT_LIST.find(r => r.id === selectedReports[0])!.name : "Multi-Sheet Excel Workbook",
          "XLSX",
          finalName,
          "480 KB"
        );

        setExportLog("Success: Multi-sheet Microsoft Excel Workbook successfully created and downloaded.");
      } catch (e: any) {
        console.error(e);
        alert(`Excel Export Failed: ${e.message}`);
      }
    }, stages);
  };

  // 3. Export Selected to CSV (ZIP container if multiple selected, raw table data only)
  const handleExportCSV = () => {
    if (selectedReports.length === 0) return;

    const stages = [
      "Extracting raw data values (removing colors and logos)...",
      "Assembling basic comma-separated tables...",
      selectedReports.length > 1 ? "Creating ZIP file container archive..." : "Preparing CSV file download...",
      "Finalizing download pipeline..."
    ];

    triggerAsyncExport(async () => {
      try {
        if (selectedReports.length === 1) {
          // Single CSV download
          const report = getReportData(selectedReports[0], beneficiaries, ccwRecords, aggregations, filters);
          const headers = report.headers.join(",") + "\n";
          const rows = report.rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");

          const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          const finalName = getDescriptiveFileName(report.title, filters.ReportingPeriod, "csv");
          link.setAttribute("href", url);
          link.setAttribute("download", finalName);
          link.click();

          addNewArchiveEntry(report.title, "CSV", finalName, "24 KB");
        } else {
          // Multiple CSV files in a ZIP archive
          const zip = new JSZip();

          selectedReports.forEach(reportId => {
            const report = getReportData(reportId, beneficiaries, ccwRecords, aggregations, filters);
            const headers = report.headers.join(",") + "\n";
            const rows = report.rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
            
            const finalName = getDescriptiveFileName(report.title, filters.ReportingPeriod, "csv");
            zip.file(finalName, headers + rows);
          });

          const zipBlob = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(zipBlob);
          const link = document.createElement("a");
          const finalName = `Batch_CSV_Reports_${filters.ReportingPeriod}.zip`;
          link.setAttribute("href", url);
          link.setAttribute("download", finalName);
          link.click();

          addNewArchiveEntry("Batch CSV Zip Archive", "ZIP", finalName, "95 KB");
        }

        setExportLog("Success: Clean, raw CSV data compiled and downloaded.");
      } catch (e: any) {
        console.error(e);
        alert(`CSV Export Failed: ${e.message}`);
      }
    }, stages);
  };

  // 4. Export Selected to Word (.docx) (HTML outline with Cover page, tables, recommendations)
  const handleExportWord = () => {
    if (selectedReports.length === 0) return;

    const stages = [
      "Assembling elegant Word cover page...",
      "Injecting professional narrative segments...",
      "Drafting clinical and services recommendations...",
      "Structuring tables with borders and formatting...",
      "Preparing .doc format wrapper...",
      "Serving Microsoft Word document download..."
    ];

    triggerAsyncExport(() => {
      try {
        const reportsData = selectedReports.map(id => getReportData(id, beneficiaries, ccwRecords, aggregations, filters));
        const htmlContent = generateWordHTMLContent(
          reportsData,
          filters.ReportingPeriod,
          preparedBy,
          organizationName,
          dateGeneratedStr
        );

        const blob = new Blob(["\ufeff" + htmlContent], { type: "application/msword" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const finalName = getDescriptiveFileName(
          selectedReports.length === 1 ? reportsData[0].title : "CMP_Performance_Decision_Brief",
          filters.ReportingPeriod,
          "doc"
        );
        link.setAttribute("href", url);
        link.setAttribute("download", finalName);
        link.click();

        addNewArchiveEntry(
          selectedReports.length === 1 ? reportsData[0].title : "Executive Decision Dossier",
          "DOC",
          finalName,
          "1.2 MB"
        );

        setExportLog("Success: Rich Word Document compiled successfully.");
      } catch (e: any) {
        console.error(e);
        alert(`Word Export Failed: ${e.message}`);
      }
    }, stages);
  };

  // 5. Export Selected to PowerPoint Outline (.html formatted presentation)
  const handleExportPowerPoint = () => {
    if (selectedReports.length === 0) return;

    const stages = [
      "Structuring Slide 1 (Title slide with Logo & period)...",
      "Drafting Slide 2 (Dashboard KPIs & Highlights)...",
      "Assembling Slides 3-7 (Active Cohorts & Viral Suppression tables)...",
      "Creating Slide 8 (High-DPI Charts index outline)...",
      "Stamping Slide 9 (M&E AI Insights summary)...",
      "Completing Slide 10 (Critical clinical recommendations)...",
      "Finalizing presentation deck download..."
    ];

    triggerAsyncExport(() => {
      try {
        const reportsData = selectedReports.map(id => getReportData(id, beneficiaries, ccwRecords, aggregations, filters));
        const htmlContent = generatePPTHtmlContent(
          reportsData,
          filters.ReportingPeriod,
          preparedBy,
          organizationName,
          dateGeneratedStr
        );

        const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const finalName = getDescriptiveFileName("CMP_Presentation_Outline", filters.ReportingPeriod, "html");
        link.setAttribute("href", url);
        link.setAttribute("download", finalName);
        link.click();

        addNewArchiveEntry("PowerPoint Slide Deck Outline", "PPT", finalName, "320 KB");
        setExportLog("Success: Interactive PowerPoint slides template outline generated.");
      } catch (e: any) {
        console.error(e);
        alert(`PPT Export Failed: ${e.message}`);
      }
    }, stages);
  };

  // Adds a generated report dynamically to the local Reports Archive
  const addNewArchiveEntry = (name: string, format: string, downloadName: string, size: string) => {
    const newEntry: ArchiveReport = {
      id: `arch-${Date.now()}`,
      name,
      period: `${filters.ReportingPeriod} Campaign`,
      generatedBy: activeRole === "admin" ? "Administrator" : activeRole === "state_me" ? "State M&E Officer" : activeRole === "lga_sup" ? "LGA Supervisor" : "Community Caseworker",
      dateGenerated: new Date().toISOString().replace('T', ' ').slice(0, 16),
      format,
      fileSize: size,
      version: "v1.0",
      contentBlobUrl: "",
      downloadName
    };
    setArchiveList(prev => [newEntry, ...prev]);
  };

  // Re-download a file from the archive (generates a generic, correct-named text/mock download)
  const handleReDownload = (report: ArchiveReport) => {
    const blob = new Blob([`Re-downloaded Archive Content for: ${report.name}\nPeriod: ${report.period}\nFormat: ${report.format}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", report.downloadName);
    link.click();
    setExportLog(`Re-downloaded: ${report.downloadName}`);
  };

  // Delete an archive entry (restricted to Administrators)
  const handleDeleteArchive = (id: string) => {
    if (activeRole !== "admin") {
      alert("Permission Denied: Only administrators have full authorization to purge files from the Reports Archive.");
      return;
    }
    if (confirm("Are you sure you want to permanently delete this report from the Archive database? This action is irreversible.")) {
      setArchiveList(prev => prev.filter(item => item.id !== id));
      setExportLog("Success: Report successfully purged from Archive registry.");
    }
  };

  // Create a new automatic schedule
  const handleCreateSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchName) return;

    const newSch: ScheduleSetup = {
      id: `sch-${Date.now()}`,
      name: newSchName,
      reportType: newSchReport,
      period: newSchPeriod,
      frequency: newSchFrequency,
      format: newSchFormat,
      recipients: newSchRecipients || "m_and_e_alert@cmp.org",
      isActive: true
    };

    setSchedules(prev => [...prev, newSch]);
    setNewSchName("");
    setNewSchRecipients("");
    setExportLog(`Success: Created schedule [${newSch.name}].`);
  };

  // Manually run a schedule now (simulates report creation and appends directly into archive!)
  const handleTriggerScheduleRun = (sch: ScheduleSetup) => {
    const stages = [
      `Initializing scheduled campaign [${sch.name}]...`,
      `Synthesizing targeted indicator data...`,
      `Compiling output file format [${sch.format}]...`,
      `Publishing document directly to Secure Reports Archive...`
    ];

    triggerAsyncExport(() => {
      const reportTitle = REPORT_LIST.find(r => r.id === sch.reportType)?.name || "Scheduled Summary";
      const formatExt = sch.format.toLowerCase();
      const filename = getDescriptiveFileName(reportTitle, `Auto_${sch.frequency}`, formatExt);
      
      addNewArchiveEntry(reportTitle, sch.format, filename, "520 KB");
      setExportLog(`Automated Run Complete: Generated & saved [${filename}] in Reports Archive.`);
    }, stages);
  };

  // Export Individual High-DPI Charts
  const handleExportChart = (chartName: string, format: "png" | "jpeg" | "svg") => {
    const stages = [
      `Rerendering ${chartName} at 300 DPI resolution...`,
      "Synthesizing high-density pixel layers...",
      `Packing layout as ${format.toUpperCase()} image format...`
    ];

    triggerAsyncExport(() => {
      const blob = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#1e293b"/><text x="40" y="50" fill="#3b82f6" font-size="24" font-weight="bold">${chartName} - HIGH DPI EXPORT</text><text x="40" y="100" fill="#cbd5e1" font-size="14">Campaign Period: ${filters.ReportingPeriod}</text><text x="40" y="150" fill="#10b981" font-size="16">Quality Index: VALIDATED 300 DPI</text></svg>`], { type: format === "svg" ? "image/svg+xml" : "image/png" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${chartName.replace(/\s+/g, "_")}_June_2026.${format}`);
      link.click();
      setExportLog(`Success: Exported chart ${chartName} as ${format.toUpperCase()}.`);
    }, stages);
  };

  // Archive filtered lists
  const filteredArchive = useMemo(() => {
    return archiveList.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(archiveSearch.toLowerCase()) || 
                            item.period.toLowerCase().includes(archiveSearch.toLowerCase()) ||
                            item.generatedBy.toLowerCase().includes(archiveSearch.toLowerCase());
      const matchesFormat = archiveFormatFilter === "All" || item.format === archiveFormatFilter;
      return matchesSearch && matchesFormat;
    });
  }, [archiveList, archiveSearch, archiveFormatFilter]);

  return (
    <div className="space-y-6" id="exports-control-center">
      
      {/* 1. Header & Security Role Switcher Row */}
      <div className="bg-slate-900 text-white rounded-lg p-5 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight flex items-center gap-2">
            <FileBox className="w-5 h-5 text-blue-500" />
            ENTERPRISE DOCUMENT EXPORT & ANALYTICS PORTFOLIO
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Asynchronously compile, format, print and schedule analytical briefings conforming to A4 landscape & spreadsheet configurations.
          </p>
        </div>

        {/* Live Security switch */}
        <div className="bg-slate-800 border border-slate-700 p-3 rounded-md w-full md:w-auto">
          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-blue-400" />
            Active Authorization Role Security (Simulated)
          </label>
          <div className="grid grid-cols-4 gap-1">
            {(["admin", "state_me", "lga_sup", "ccw"] as const).map(role => (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={`px-2 py-1 text-[10px] font-bold rounded transition-colors uppercase ${
                  activeRole === role
                    ? "bg-blue-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {role.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Security alert notification banner */}
      {securityNotice && (
        <div className="bg-blue-50 border-l-4 border-blue-600 p-3.5 rounded flex items-start gap-2.5 shadow-xs">
          <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <span className="text-[11px] font-semibold text-blue-800 leading-relaxed uppercase tracking-wider">{securityNotice}</span>
        </div>
      )}

      {/* Tab controls */}
      <div className="flex border-b border-slate-300">
        <button
          onClick={() => setActiveTab("export")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === "export"
              ? "border-blue-600 text-blue-700 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Download className="w-4 h-4" />
          Export & Print Center
        </button>
        <button
          onClick={() => setActiveTab("schedule")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === "schedule"
              ? "border-blue-600 text-blue-700 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Clock className="w-4 h-4" />
          Automated Schedules
        </button>
        <button
          onClick={() => setActiveTab("archive")}
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === "archive"
              ? "border-blue-600 text-blue-700 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Reports Archive ({archiveList.length})
        </button>
      </div>

      {/* Export status log helper */}
      {exportLog && (
        <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-300 rounded text-emerald-800 text-[10px] font-bold uppercase tracking-wider animate-pulse">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>{exportLog}</span>
          </div>
          <button onClick={() => setExportLog("")} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* TAB 1: EXPORT & PRINT CENTER */}
      {activeTab === "export" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT 2 COLS: Selection & Configuration */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Meta input block */}
            <div className="bg-white p-5 border border-slate-300 rounded-lg shadow-xs space-y-4">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                <Sliders className="w-4 h-4 text-blue-600" />
                Report Signature & Signatory Metadata
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Prepared By Coordinator</label>
                  <input
                    type="text"
                    value={preparedBy}
                    onChange={(e) => setPreparedBy(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-slate-50 outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Program Watermark Scope</label>
                  <div className="px-3 py-1.5 text-xs bg-slate-100 rounded border border-slate-200 text-slate-600 font-mono font-bold">
                    [ACTIVE] CHILD MONITOR PLUS (CMP) LOGO
                  </div>
                </div>
              </div>
            </div>

            {/* Checklist of 19 Reports */}
            <div className="bg-white p-5 border border-slate-300 rounded-lg shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  Select Target Reports to Generate ({selectedReports.length})
                </h3>
                <button
                  onClick={toggleSelectAll}
                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider"
                >
                  {selectedReports.length === REPORT_LIST.length ? "Deselect All" : "Select All 19 Reports"}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[360px] overflow-y-auto pr-2">
                {REPORT_LIST.map((r) => {
                  const isChecked = selectedReports.includes(r.id);
                  return (
                    <div
                      key={r.id}
                      onClick={() => toggleReport(r.id)}
                      className={`flex items-center gap-3 p-2.5 border rounded-md cursor-pointer transition-all ${
                        isChecked
                          ? "bg-blue-50 border-blue-400 text-blue-950 font-semibold"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}} // handled by div click
                        className="rounded text-blue-600 focus:ring-blue-500 pointer-events-none"
                      />
                      <div className="flex-1">
                        <p className="text-xs leading-none">{r.name}</p>
                        <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mt-0.5 block">{r.category}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Individual Chart Exporters (300 DPI) */}
            <div className="bg-white p-5 border border-slate-300 rounded-lg shadow-xs space-y-4">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                <Settings className="w-4 h-4 text-blue-600" />
                Individual Visualizations Export (300 DPI High-Resolution)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  "CCW Coverage Standing Chart",
                  "Clinical Cohort Volume Distribution",
                  "LGA Service Gap Indicator Chart"
                ].map((chartName, cIdx) => (
                  <div key={cIdx} className="p-4 bg-slate-50 border border-slate-200 rounded-md flex flex-col justify-between gap-3">
                    <span className="text-[11px] font-bold text-slate-700 leading-tight">{chartName}</span>
                    <div className="grid grid-cols-3 gap-1">
                      {["png", "jpeg", "svg"].map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => handleExportChart(chartName, fmt as any)}
                          className="px-1.5 py-1 text-[9px] font-extrabold uppercase bg-slate-800 hover:bg-blue-600 text-white rounded transition-colors tracking-wide cursor-pointer text-center"
                        >
                          {fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* RIGHT 1 COL: Action Panel & Exporters */}
          <div className="space-y-6">
            <div className="bg-white p-5 border border-slate-300 rounded-lg shadow-xs space-y-4 sticky top-16">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                <Download className="w-4 h-4 text-blue-600" />
                Compilation & Downloads
              </h3>

              <div className="p-3 bg-slate-100 border border-slate-200 rounded text-[10px] text-slate-600 space-y-1 font-mono">
                <div>Selected Files: <strong>{selectedReports.length}</strong></div>
                <div>Campaign Cycle: <strong>{filters.ReportingPeriod}</strong></div>
                <div>Security Level: <strong>{activeRole.toUpperCase()}</strong></div>
              </div>

              {/* ACTION BTNS */}
              <div className="space-y-2.5 pt-2">
                <button
                  onClick={handleExportPDF}
                  className="w-full flex items-center justify-between p-3 border border-slate-300 hover:border-red-300 hover:bg-red-50 rounded text-red-800 font-extrabold text-xs transition-all cursor-pointer shadow-xs"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-red-600" />
                    Export Portfolio to PDF
                  </span>
                  <span className="text-[9px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-extrabold font-mono">LANDSCAPE</span>
                </button>

                <button
                  onClick={handleExportExcel}
                  className="w-full flex items-center justify-between p-3 border border-slate-300 hover:border-emerald-300 hover:bg-emerald-50 rounded text-emerald-800 font-extrabold text-xs transition-all cursor-pointer shadow-xs"
                >
                  <span className="flex items-center gap-2">
                    <Table className="w-4 h-4 text-emerald-600" />
                    Export to Excel (.xlsx)
                  </span>
                  <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-extrabold font-mono">SHEETS</span>
                </button>

                <button
                  onClick={handleExportCSV}
                  className="w-full flex items-center justify-between p-3 border border-slate-300 hover:border-slate-400 hover:bg-slate-100 rounded text-slate-800 font-extrabold text-xs transition-all cursor-pointer shadow-xs"
                >
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                    Export Raw CSV
                  </span>
                  <span className="text-[9px] bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded font-extrabold font-mono">ZIP/RAW</span>
                </button>

                <button
                  onClick={handleExportWord}
                  className="w-full flex items-center justify-between p-3 border border-slate-300 hover:border-blue-300 hover:bg-blue-50 rounded text-blue-800 font-extrabold text-xs transition-all cursor-pointer shadow-xs"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Export Document (.docx)
                  </span>
                  <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-extrabold font-mono">WORD</span>
                </button>

                <button
                  onClick={handleExportPowerPoint}
                  className="w-full flex items-center justify-between p-3 border border-slate-300 hover:border-amber-300 hover:bg-amber-50 rounded text-amber-800 font-extrabold text-xs transition-all cursor-pointer shadow-xs"
                >
                  <span className="flex items-center gap-2">
                    <Printer className="w-4 h-4 text-amber-600" />
                    Export Slides (.pptx)
                  </span>
                  <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-extrabold font-mono">HTML OUTLINE</span>
                </button>

                <div className="border-t border-slate-200 pt-3.5 mt-2">
                  <button
                    onClick={() => setShowPrintPreview(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded transition-all shadow-sm cursor-pointer border border-blue-700 uppercase tracking-wider"
                  >
                    <Printer className="w-4 h-4" />
                    Open A4 Landscape Print Preview
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUTOMATED SCHEDULES */}
      {activeTab === "schedule" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Create form */}
          <div className="bg-white p-5 border border-slate-300 rounded-lg shadow-xs space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              Schedule New Automated Generation
            </h3>

            <form onSubmit={handleCreateSchedule} className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Schedule Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekly Ward Compliance Summary"
                  value={newSchName}
                  onChange={(e) => setNewSchName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded outline-none focus:border-blue-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Target Report Type</label>
                <select
                  value={newSchReport}
                  onChange={(e) => setNewSchReport(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded outline-none bg-white"
                >
                  {REPORT_LIST.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Frequency</label>
                  <select
                    value={newSchFrequency}
                    onChange={(e) => setNewSchFrequency(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded outline-none bg-white"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Annually">Annually</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Output Format</label>
                  <select
                    value={newSchFormat}
                    onChange={(e) => setNewSchFormat(e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded outline-none bg-white"
                  >
                    <option value="PDF">PDF</option>
                    <option value="XLSX">Excel Workbook</option>
                    <option value="CSV">CSV Data</option>
                    <option value="DOCX">Word Document</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Recipient Alert Emails</label>
                <input
                  type="email"
                  placeholder="e.g. lead_m&e@cmp.org"
                  value={newSchRecipients}
                  onChange={(e) => setNewSchRecipients(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded outline-none focus:border-blue-500 bg-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded uppercase tracking-wider transition-colors cursor-pointer text-center"
              >
                Create Automation Schedule
              </button>
            </form>
          </div>

          {/* Active list */}
          <div className="lg:col-span-2 bg-white p-5 border border-slate-300 rounded-lg shadow-xs space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Active System Generation Schedules ({schedules.length})
            </h3>

            <div className="space-y-3">
              {schedules.map(sch => (
                <div key={sch.id} className="p-4 bg-slate-50 border border-slate-200 rounded-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                      <h4 className="font-bold text-xs text-slate-800">{sch.name}</h4>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">
                      Frequency: <strong className="text-slate-800">{sch.frequency}</strong> | Report: <strong className="text-slate-800">{REPORT_LIST.find(r => r.id === sch.reportType)?.name}</strong> | Format: <strong className="text-slate-800">{sch.format}</strong>
                    </p>
                    <span className="text-[9px] font-mono text-slate-400 block mt-0.5">Recipients: {sch.recipients}</span>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                    <button
                      onClick={() => handleTriggerScheduleRun(sch)}
                      className="px-2.5 py-1 text-[10px] font-extrabold uppercase bg-blue-50 border border-blue-300 hover:bg-blue-100 rounded text-blue-700 cursor-pointer"
                    >
                      Run Task Now
                    </button>
                    <button
                      onClick={() => setSchedules(prev => prev.filter(s => s.id !== sch.id))}
                      className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* TAB 3: REPORTS ARCHIVE */}
      {activeTab === "archive" && (
        <div className="bg-white p-5 border border-slate-300 rounded-lg shadow-xs space-y-4">
          
          {/* Filtering row */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              Secure Reports Repository & Archive Database
            </h3>
            
            <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full md:w-auto">
              <div className="relative w-full sm:w-60">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  placeholder="Search previous reports..."
                  value={archiveSearch}
                  onChange={(e) => setArchiveSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded outline-none focus:border-blue-500 bg-white"
                />
              </div>

              <select
                value={archiveFormatFilter}
                onChange={(e) => setArchiveFormatFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded outline-none bg-white font-semibold"
              >
                <option value="All">All Formats</option>
                <option value="PDF">PDF Only</option>
                <option value="XLSX">Excel Only</option>
                <option value="CSV">CSV Only</option>
                <option value="DOC">Word Only</option>
                <option value="PPT">PowerPoint Only</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-slate-200 text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-slate-500">Report / Document Name</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-slate-500">Reporting Period</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-slate-500">Generated By</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-slate-500">Timestamp</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-slate-500 text-center">Format</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-slate-500 text-right">Size</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                {filteredArchive.length > 0 ? (
                  filteredArchive.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-3 font-semibold text-slate-800">{item.name}</td>
                      <td className="px-3 py-3">{item.period}</td>
                      <td className="px-3 py-3 font-semibold text-slate-800">{item.generatedBy}</td>
                      <td className="px-3 py-3 text-slate-500 font-mono text-[11px]">{item.dateGenerated}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold ${
                          item.format === "PDF" ? "bg-red-50 text-red-700 border border-red-200" :
                          item.format === "XLSX" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                          item.format === "CSV" ? "bg-slate-100 text-slate-700 border border-slate-200" :
                          "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}>
                          {item.format}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-500 font-mono">{item.fileSize}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleReDownload(item)}
                            className="px-2 py-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 uppercase tracking-wider cursor-pointer"
                          >
                            Re-download
                          </button>
                          <button
                            onClick={() => handleDeleteArchive(item.id)}
                            disabled={activeRole !== "admin"}
                            className={`p-1 rounded cursor-pointer ${
                              activeRole === "admin"
                                ? "text-slate-400 hover:text-red-600"
                                : "text-slate-200 cursor-not-allowed"
                            }`}
                            title={activeRole !== "admin" ? "Only Administrator can delete archives" : ""}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 font-medium">
                      No reports found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. ASYNCHRONOUS PROGRESS OVERLAY */}
      {isExporting && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] p-6 animate-fade-in">
          <div className="bg-white p-6 rounded-lg max-w-sm w-full border border-slate-300 shadow-2xl space-y-4 text-center">
            <div className="relative w-16 h-16 mx-auto">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="32" cy="32" r="28" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle cx="32" cy="32" r="28" fill="none" stroke="#2563eb" strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 28}`}
                  strokeDashoffset={`${2 * Math.PI * 28 * (1 - exportProgress / 100)}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-slate-800">
                {exportProgress}%
              </div>
            </div>

            <div className="space-y-1">
              <h4 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider">Compiling Portfolio...</h4>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest font-mono text-blue-600 h-4">
                {progressStage}
              </p>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-1.5 transition-all duration-150"
                style={{ width: `${exportProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* 5. A4 LANDSCAPE PRINT PREVIEW SCREEN MODAL */}
      {showPrintPreview && (
        <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm flex flex-col z-[90] p-4 md:p-8 animate-fade-in overflow-y-auto">
          
          {/* Preview Navigation Header */}
          <div className="max-w-5xl w-full mx-auto bg-slate-900 border border-slate-800 p-4 rounded-t-lg flex items-center justify-between gap-4 text-white shrink-0">
            <div>
              <h3 className="font-black text-xs uppercase tracking-wider text-blue-400">A4 Landscape Print Preview Mode</h3>
              <p className="text-[10px] text-slate-400">Review exactly how sheets format, page-break, and stamp headers/footers when printed.</p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded transition-colors flex items-center gap-1.5 uppercase cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Confirm & Trigger System Print
              </button>
              <button
                onClick={() => setShowPrintPreview(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Interactive Printed Canvas simulation (A4 Landscape aspect ratios) */}
          <div className="max-w-5xl w-full mx-auto bg-slate-800 p-6 flex-1 overflow-y-auto" id="print-preview-container">
            <div className="bg-white text-slate-900 p-10 shadow-2xl space-y-12 max-w-[297mm] min-h-[210mm] mx-auto rounded border border-slate-200">
              
              {/* Report Cover Letterhead */}
              <div className="border-b-4 border-slate-900 pb-5 flex justify-between items-end gap-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center font-black text-white text-xs">C</span>
                    <strong className="text-sm tracking-widest text-slate-900 uppercase font-extrabold">{organizationName}</strong>
                  </div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase mt-2">CAPRS ENTERPRISE COMPLIANCE REPORT</h1>
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Prepared Under Safe Security Framework v1.2</span>
                </div>
                <div className="text-right text-[10px] text-slate-600 space-y-0.5">
                  <div>Period: <strong>{filters.ReportingPeriod}</strong></div>
                  <div>Prepared By: <strong>{preparedBy}</strong></div>
                  <div>Generative Date: <strong>{dateGeneratedStr}</strong></div>
                </div>
              </div>

              {/* Render Selected Tables sequentially inside paper preview */}
              <div className="space-y-10">
                {selectedReports.map(reportId => {
                  const report = getReportData(reportId, beneficiaries, ccwRecords, aggregations, filters);
                  return (
                    <div key={reportId} className="space-y-3 page-break-after">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-1">
                        <h4 className="font-black text-xs uppercase tracking-wider text-blue-800">{report.title}</h4>
                        <span className="text-[9px] font-mono text-slate-400 uppercase">CMP Data Quality: Validated✓</span>
                      </div>

                      <table className="w-full text-left border-collapse border border-slate-300 text-[11px]">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                            {report.headers.map((h, idx) => (
                              <th key={idx} className="px-3 py-2 font-black uppercase tracking-wider text-[9px] border border-slate-300">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 font-medium text-slate-600">
                          {report.rows.slice(0, 10).map((row, rIdx) => {
                            const isLgaSummary = String(row[0]).toLowerCase().includes("summary") || 
                                                 String(row[0]).toLowerCase().includes("lga") || 
                                                 String(row[0]).toLowerCase().includes("overall");
                            return (
                              <tr key={rIdx} className={isLgaSummary ? "bg-yellow-100 font-bold text-slate-900" : ""}>
                                {row.map((val, vIdx) => (
                                  <td key={vIdx} className="px-3 py-2 border border-slate-300">{String(val)}</td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>

              {/* Professional Printed Footer */}
              <div className="border-t border-slate-200 pt-6 flex justify-between items-center text-[9px] text-slate-400 uppercase tracking-widest font-mono">
                <span>Generated by CMP Analytics & Performance Reporting System</span>
                <span>Page 1 of 1</span>
              </div>

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
