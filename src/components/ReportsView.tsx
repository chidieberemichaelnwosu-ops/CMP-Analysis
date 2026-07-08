/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Users,
  Award,
  Activity,
  Heart,
  ClipboardList,
  AlertOctagon,
  Calendar,
  Download,
  BarChart2,
  CheckCircle,
  TrendingUp,
  Printer,
  X,
  ChevronDown,
  ChevronUp,
  Sliders,
  AlertTriangle
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ComposedChart,
  Line,
  Area,
  PieChart,
  Pie,
  Cell
} from "recharts";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

import {
  Beneficiary,
  CCWCounter,
  AggregationNode,
  ReportFilters,
  DataQualitySummary,
  ReportingPeriod
} from "../types";
import {
  computeVLReport,
  computeTBReport,
  computeNutritionReport,
  computeReferralReport,
  computeHEIReport,
  computeStatusReport
} from "../utils/reportDetailsHelper";
import {
  calculateCCWPerformance,
  CCWPerformanceRow,
  LGAPerformanceGroup,
  ValidationError
} from "../utils/ccwPerformanceService";
import { parseDate, isDateInReportingPeriod } from "../utils/reportingEngine";

interface ReportsViewProps {
  beneficiaries: Beneficiary[];
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
  setFilters?: React.Dispatch<React.SetStateAction<ReportFilters>>;
  dataQualitySummary: DataQualitySummary;
  targetDate: Date;
}

type ReportType =
  | "daily" | "weekly" | "monthly" | "quarterly" | "annual" | "custom"
  | "ccw" | "community" | "ward" | "lga" | "state"
  | "calhiv" | "hei" | "status" | "vl" | "unsuppressed" | "tb" | "nutrition" | "referral" | "dq";

const CHART_COLORS = ["#2563eb", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function ReportsView({
  beneficiaries,
  ccwRecords,
  aggregations,
  filters,
  setFilters,
  dataQualitySummary,
  targetDate
}: ReportsViewProps) {
  const [activeReport, setActiveReport] = useState<ReportType>("ccw");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  // CCW Performance Report specific interactive states
  const [ccwSearchQuery, setCcwSearchQuery] = useState("");
  const [communitySearchQuery, setCommunitySearchQuery] = useState("");
  const [lgaSearchQuery, setLgaSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<string>("lga");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showCharts, setShowCharts] = useState(true);
  const [selectedCcwForDetails, setSelectedCcwForDetails] = useState<CCWPerformanceRow | null>(null);

  // Categories of reports
  const categories = [
    {
      title: "Performance Reports",
      icon: <Award className="w-3.5 h-3.5 text-amber-500" />,
      items: [
        { id: "ccw", name: "CCW Monthly Performance" },
        { id: "community", name: "Community Performance" },
        { id: "ward", name: "Ward Performance" },
        { id: "lga", name: "LGA Performance" },
        { id: "state", name: "State Performance" },
      ]
    },
    {
      title: "Reporting Periods",
      icon: <Calendar className="w-3.5 h-3.5 text-blue-600" />,
      items: [
        { id: "daily", name: "Daily Service Report", period: ReportingPeriod.DAILY },
        { id: "weekly", name: "Weekly Service Report", period: ReportingPeriod.WEEKLY },
        { id: "monthly", name: "Monthly Service Report", period: ReportingPeriod.MONTHLY },
        { id: "quarterly", name: "Quarterly Service Report", period: ReportingPeriod.QUARTERLY },
        { id: "annual", name: "Annual Service Report", period: ReportingPeriod.ANNUAL },
        { id: "custom", name: "Custom Date Range", period: ReportingPeriod.CUSTOM },
      ]
    },
    {
      title: "Clinical Cohorts & M&E",
      icon: <Heart className="w-3.5 h-3.5 text-red-500" />,
      items: [
        { id: "calhiv", name: "CALHIV Tracking" },
        { id: "hei", name: "HEI / PCR Diagnostics" },
        { id: "vl", name: "Viral Load Ledger" },
        { id: "unsuppressed", name: "Unsuppressed Follow-Up" },
        { id: "tb", name: "Tuberculosis (TB/TPT)" },
        { id: "nutrition", name: "Nutritional Assessment" },
        { id: "referral", name: "Referral & Linkages" },
      ]
    },
    {
      title: "System & Administration",
      icon: <ClipboardList className="w-3.5 h-3.5 text-slate-500" />,
      items: [
        { id: "status", name: "Beneficiary Status Audit" },
        { id: "dq", name: "Data Quality Logs" },
      ]
    }
  ];

  // Map Category selection to appropriate view
  const reportTitle = useMemo(() => {
    for (const cat of categories) {
      const match = cat.items.find(i => i.id === activeReport);
      if (match) return match.name;
    }
    return "M&E Analytics Report";
  }, [activeReport]);

  // Handle pagination reset on report change
  const handleReportChange = (id: ReportType) => {
    setActiveReport(id);
    setSearchQuery("");
    setCurrentPage(1);
  };

  // Compute CCW Monthly Performance Report data via calculation service
  const performanceData = useMemo(() => {
    return calculateCCWPerformance(beneficiaries, filters, targetDate);
  }, [beneficiaries, filters, targetDate]);

  // Handle Sort Toggle for Grouped CCW Report
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Process sorting and search filters for the Grouped CCW table
  const sortedCcwGroups = useMemo(() => {
    let result = [...performanceData.groups];

    // Apply interactive search: CCW, Community, LGA
    if (ccwSearchQuery || communitySearchQuery || lgaSearchQuery) {
      result = result.map(group => {
        const filteredCcws = group.ccws.filter(c => {
          const matchesCcw = !ccwSearchQuery || c.ccwName.toLowerCase().includes(ccwSearchQuery.toLowerCase());
          const matchesLga = !lgaSearchQuery || c.lga.toLowerCase().includes(lgaSearchQuery.toLowerCase());
          const matchesComm = !communitySearchQuery || c.community.toLowerCase().includes(communitySearchQuery.toLowerCase());
          return matchesCcw && matchesLga && matchesComm;
        });

        // Compute filtered totals for this LGA group
        const lgaCmp = filteredCcws.reduce((sum, item) => sum + item.cmp, 0);
        const lgaCalhiv = filteredCcws.reduce((sum, item) => sum + item.calhiv, 0);
        const lgaHei = filteredCcws.reduce((sum, item) => sum + item.hei, 0);
        const lgaCalhivServed = filteredCcws.reduce((sum, item) => sum + item.calhivServed, 0);
        const lgaHeiServed = filteredCcws.reduce((sum, item) => sum + item.heiServed, 0);
        const lgaTotalServed = lgaCalhivServed + lgaHeiServed;
        const lgaOutstanding = lgaCmp - lgaTotalServed;
        const lgaServedPercent = lgaCmp > 0 ? Math.round((lgaTotalServed / lgaCmp) * 100) : 0;

        return {
          ...group,
          cmp: lgaCmp,
          calhiv: lgaCalhiv,
          hei: lgaHei,
          calhivServed: lgaCalhivServed,
          heiServed: lgaHeiServed,
          servedPercent: lgaServedPercent,
          outstanding: lgaOutstanding,
          ccws: filteredCcws
        };
      }).filter(group => {
        const matchesLgaDirect = !lgaSearchQuery || group.lgaName.toLowerCase().includes(lgaSearchQuery.toLowerCase());
        return (matchesLgaDirect && group.ccws.length > 0) || group.ccws.length > 0;
      });
    }

    // Apply column sorting
    if (sortColumn) {
      const isAsc = sortDirection === "asc";

      result.sort((a, b) => {
        let valA: any = 0;
        let valB: any = 0;

        if (sortColumn === "lga") {
          valA = a.lgaName;
          valB = b.lgaName;
        } else if (sortColumn === "cmp") {
          valA = a.cmp;
          valB = b.cmp;
        } else if (sortColumn === "calhiv") {
          valA = a.calhiv;
          valB = b.calhiv;
        } else if (sortColumn === "hei") {
          valA = a.hei;
          valB = b.hei;
        } else if (sortColumn === "calhivServed") {
          valA = a.calhivServed;
          valB = b.calhivServed;
        } else if (sortColumn === "heiServed") {
          valA = a.heiServed;
          valB = b.heiServed;
        } else if (sortColumn === "servedPercent") {
          valA = a.servedPercent;
          valB = b.servedPercent;
        } else if (sortColumn === "outstanding") {
          valA = a.outstanding;
          valB = b.outstanding;
        }

        if (valA < valB) return isAsc ? -1 : 1;
        if (valA > valB) return isAsc ? 1 : -1;
        return 0;
      });

      // Sort children CCWs inside each LGA group as well
      result = result.map(group => {
        const sortedCcws = [...group.ccws];
        sortedCcws.sort((a, b) => {
          let valA: any = 0;
          let valB: any = 0;

          if (sortColumn === "lga") {
            valA = a.ccwName;
            valB = b.ccwName;
          } else if (sortColumn === "cmp") {
            valA = a.cmp;
            valB = b.cmp;
          } else if (sortColumn === "calhiv") {
            valA = a.calhiv;
            valB = b.calhiv;
          } else if (sortColumn === "hei") {
            valA = a.hei;
            valB = b.hei;
          } else if (sortColumn === "calhivServed") {
            valA = a.calhivServed;
            valB = b.calhivServed;
          } else if (sortColumn === "heiServed") {
            valA = a.heiServed;
            valB = b.heiServed;
          } else if (sortColumn === "servedPercent") {
            valA = a.servedPercent;
            valB = b.servedPercent;
          } else if (sortColumn === "outstanding") {
            valA = a.outstanding;
            valB = b.outstanding;
          }

          if (valA < valB) return isAsc ? -1 : 1;
          if (valA > valB) return isAsc ? 1 : -1;
          return 0;
        });

        return {
          ...group,
          ccws: sortedCcws
        };
      });
    }

    return result;
  }, [performanceData.groups, ccwSearchQuery, communitySearchQuery, lgaSearchQuery, sortColumn, sortDirection]);

  // Compute specialized report datasets for other reports
  const vlData = useMemo(() => computeVLReport(beneficiaries, filters), [beneficiaries, filters]);
  const tbData = useMemo(() => computeTBReport(beneficiaries, filters), [beneficiaries, filters]);
  const nutritionData = useMemo(() => computeNutritionReport(beneficiaries, filters), [beneficiaries, filters]);
  const referralData = useMemo(() => computeReferralReport(beneficiaries, filters), [beneficiaries, filters]);
  const heiData = useMemo(() => computeHEIReport(beneficiaries, filters), [beneficiaries, filters]);
  const statusData = useMemo(() => computeStatusReport(beneficiaries, filters), [beneficiaries, filters]);

  // Filter and Paginate Table Data for standard (non-CCW) reports
  const tableContent = useMemo(() => {
    let headers: string[] = [];
    let rows: any[] = [];

    const matchesSearch = (item: any, fields: string[]) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return fields.some(f => String(item[f] || "").toLowerCase().includes(query));
    };

    switch (activeReport) {
      case "daily":
      case "weekly":
      case "monthly":
      case "quarterly":
      case "annual":
      case "custom": {
        headers = ["Level Name", "Active Target (CMP)", "Active CALHIV", "Active HEI", "CALHIV Served", "HEI Served", "Total Served", "Outstanding", "Coverage %"];
        rows = aggregations.lga
          .filter(r => matchesSearch(r, ["name"]))
          .map(r => [
            r.name,
            r.ActiveCMP.toLocaleString(),
            r.ActiveCALHIV.toLocaleString(),
            r.ActiveHEI.toLocaleString(),
            r.CALHIVServed.toLocaleString(),
            r.HEIServed.toLocaleString(),
            r.TotalServed.toLocaleString(),
            r.Outstanding.toLocaleString(),
            `${r.Coverage.toFixed(1)}%`
          ]);
        break;
      }

      case "community": {
        headers = ["Community", "LGA/State", "Active Target (CMP)", "CALHIV Served", "HEI Served", "Total Served", "Outstanding", "Coverage %"];
        rows = aggregations.community
          .filter(r => matchesSearch(r, ["name"]))
          .map(r => [
            r.name,
            `${r.name} Community`,
            r.ActiveCMP.toLocaleString(),
            r.CALHIVServed.toLocaleString(),
            r.HEIServed.toLocaleString(),
            r.TotalServed.toLocaleString(),
            r.Outstanding.toLocaleString(),
            `${r.Coverage.toFixed(1)}%`
          ]);
        break;
      }

      case "ward": {
        headers = ["Ward", "Active Target (CMP)", "CALHIV Served", "HEI Served", "Total Served", "Outstanding", "Coverage %"];
        rows = aggregations.ward
          .filter(r => matchesSearch(r, ["name"]))
          .map(r => [
            r.name,
            r.ActiveCMP.toLocaleString(),
            r.CALHIVServed.toLocaleString(),
            r.HEIServed.toLocaleString(),
            r.TotalServed.toLocaleString(),
            r.Outstanding.toLocaleString(),
            `${r.Coverage.toFixed(1)}%`
          ]);
        break;
      }

      case "lga": {
        headers = ["LGA Name", "Active Target (CMP)", "CALHIV Served", "HEI Served", "Total Served", "Outstanding", "Coverage %"];
        rows = aggregations.lga
          .filter(r => matchesSearch(r, ["name"]))
          .map(r => [
            r.name,
            r.ActiveCMP.toLocaleString(),
            r.CALHIVServed.toLocaleString(),
            r.HEIServed.toLocaleString(),
            r.TotalServed.toLocaleString(),
            r.Outstanding.toLocaleString(),
            `${r.Coverage.toFixed(1)}%`
          ]);
        break;
      }

      case "state": {
        headers = ["State Name", "Active Target (CMP)", "CALHIV Served", "HEI Served", "Total Served", "Outstanding", "Coverage %"];
        rows = aggregations.state
          .filter(r => matchesSearch(r, ["name"]))
          .map(r => [
            r.name,
            r.ActiveCMP.toLocaleString(),
            r.CALHIVServed.toLocaleString(),
            r.HEIServed.toLocaleString(),
            r.TotalServed.toLocaleString(),
            r.Outstanding.toLocaleString(),
            `${r.Coverage.toFixed(1)}%`
          ]);
        break;
      }

      case "calhiv": {
        headers = ["VC ID", "Child Name", "Gender/Age", "CCW Assigned", "Current HIV Status", "ART Start Date", "Current ART Facility", "Latest Service Date", "OVC Status"];
        rows = beneficiaries
          .filter(b => b.EnrolmentStream === "CALHIV" && b.OVCStatus === "Active" && matchesSearch(b, ["VCUniqueID", "ChildName", "CCWName"]))
          .map(b => [
            b.VCUniqueID,
            b.ChildName || "Anonymous",
            `${b.Sex} (${b.Age} ${b.AgeUnit})`,
            b.CCWName || "Unassigned",
            b.CurrentHIVStatus || "N/A",
            b.ARTStartDate || "N/A",
            b.CurrentARTFacility || "N/A",
            b.DateOfLatestServiceProvided || "None",
            b.OVCStatus
          ]);
        break;
      }

      case "hei": {
        headers = ["VC ID", "Child Name", "Age", "CCW", "Mother ART UID", "PCR 1 Result", "PCR 2 Result", "HEI Tracking Status"];
        rows = beneficiaries
          .filter(b => b.EnrolmentStream === "HEI" && b.OVCStatus === "Active" && matchesSearch(b, ["VCUniqueID", "ChildName", "CCWName"]))
          .map(b => [
            b.VCUniqueID,
            b.ChildName || "Anonymous",
            `${b.Age} ${b.AgeUnit}`,
            b.CCWName || "Unassigned",
            b.MotherARTUID || "N/A",
            b.FirstPCRResult || "Pending",
            b.SecondPCRResult || "Pending",
            b.HEITracking || "Inactive"
          ]);
        break;
      }

      case "vl": {
        headers = ["VC ID", "Child Name", "Gender/Age", "ART Facility", "VL Carried Out", "Date of VL", "VL Result (Copies/mL)", "Suppression Status"];
        rows = beneficiaries
          .filter(b => b.EnrolmentStream === "CALHIV" && b.OVCStatus === "Active" && matchesSearch(b, ["VCUniqueID", "ChildName"]))
          .map(b => [
            b.VCUniqueID,
            b.ChildName || "Anonymous",
            `${b.Sex} (${b.Age} ${b.AgeUnit})`,
            b.CurrentARTFacility || "N/A",
            b.VLCarriedOut || "No",
            b.DateofVL || "N/A",
            b.VLResult || "N/A",
            b.VLSuppressionStatus || "Not Tested"
          ]);
        break;
      }

      case "unsuppressed": {
        headers = ["VC ID", "Child Name", "Gender/Age", "CCW Name / Phone", "ART Facility", "VL Result", "Date of VL", "Action Code"];
        rows = vlData.unsuppressedRoster
          .filter(r => matchesSearch(r, ["vcId", "name", "ccw"]))
          .map(r => [
            r.vcId,
            r.name,
            `${r.sex} (${r.age} Yrs)`,
            r.ccw,
            r.artFacility,
            r.vlResult,
            r.dateOfVl,
            "URGENT EAC SEQUENCE"
          ]);
        break;
      }

      case "tb": {
        headers = ["VC ID", "Child Name", "Gender/Age", "CCW", "TB Screening Outcome", "Referred for Dx", "TB Detected", "Eligible for TPT", "TPT Commenced"];
        rows = beneficiaries
          .filter(b => b.OVCStatus === "Active" && matchesSearch(b, ["VCUniqueID", "ChildName"]))
          .map(b => [
            b.VCUniqueID,
            b.ChildName || "Anonymous",
            `${b.Sex} (${b.Age})`,
            b.CCWName || "Unassigned",
            b.TBScreeningOutcome || "Not Screened",
            b.ReferredforTBDiagnosis || "No",
            b.TBDetected || "No",
            b.EligibleforTBTPT || "No",
            b.CommencedonTBPreventive || "No"
          ]);
        break;
      }

      case "nutrition": {
        headers = ["VC ID", "Child Name", "Age/Sex", "CCW", "Weight (kg)", "Height (cm)", "BMI", "Nutrition Status"];
        rows = beneficiaries
          .filter(b => b.OVCStatus === "Active" && matchesSearch(b, ["VCUniqueID", "ChildName"]))
          .map(b => [
            b.VCUniqueID,
            b.ChildName || "Anonymous",
            `${b.Age}Y / ${b.Sex}`,
            b.CCWName || "Unassigned",
            b.Weight ? `${b.Weight} kg` : "N/A",
            b.Height ? `${b.Height} cm` : "N/A",
            b.BMI ? b.BMI.toFixed(1) : "N/A",
            b.NutritionStatus || "Not Screened"
          ]);
        break;
      }

      case "referral": {
        headers = ["VC ID", "Child Name", "CCW", "Referral Date", "Service Needed", "Referral Org", "Linkage Status"];
        rows = referralData.recentReferrals
          .filter(r => matchesSearch(r, ["vcId", "name", "ccw"]))
          .map(r => [
            r.vcId,
            r.name,
            r.ccw,
            r.date,
            r.serviceNeeded,
            r.org,
            r.status
          ]);
        break;
      }

      case "status": {
        headers = ["VC ID", "Child Name", "Gender/Age", "CCW", "Enrolment Stream", "OVC Status", "Caregiver Relationship"];
        rows = beneficiaries
          .filter(b => matchesSearch(b, ["VCUniqueID", "ChildName", "CCWName"]))
          .map(b => [
            b.VCUniqueID,
            b.ChildName || "Anonymous",
            `${b.Sex} (${b.Age} ${b.AgeUnit})`,
            b.CCWName || "Unassigned",
            b.EnrolmentStream,
            b.OVCStatus,
            b.CaregiverRelationship || "Caregiver"
          ]);
        break;
      }

      case "dq": {
        headers = ["Row", "VC Unique ID", "Severity", "Category", "Column Field", "Description of DQ Anomaly", "Uploaded Value"];
        rows = dataQualitySummary.issues
          .filter(i => matchesSearch(i, ["vcId", "description", "field"]))
          .map(i => [
            i.rowIndex ? `Row ${i.rowIndex}` : "Schema",
            i.vcId || "N/A",
            i.severity,
            i.category,
            i.field,
            i.description,
            i.value || "Blank"
          ]);
        break;
      }

      default:
        break;
    }

    return { headers, rows };
  }, [activeReport, searchQuery, beneficiaries, aggregations, dataQualitySummary, vlData, referralData]);

  // Paginated rows for standard tables
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    return tableContent.rows.slice(start, end);
  }, [tableContent.rows, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(tableContent.rows.length / rowsPerPage) || 1;

  // LGA Drilldown Navigation Click Handler
  const handleLgaClick = (lgaName: string) => {
    if (setFilters) {
      setFilters(prev => ({
        ...prev,
        LGA: lgaName,
        Ward: "",
        Community: "",
        CCW: ""
      }));
      setActiveReport("community");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // EXPORT HANDLERS FOR THE CCW PERFORMANCE REPORT

  // 1. Export to Excel (using pre-installed sheetjs / xlsx)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    const rows: any[] = [];

    // Header Metadata
    rows.push(["CCW MONTHLY PERFORMANCE REPORT"]);
    rows.push([`Reporting Period: ${filters.ReportingPeriod}`]);
    rows.push([`Generated On: ${new Date().toLocaleDateString()}`]);
    rows.push([]);

    // Table Column Headers
    rows.push([
      "LGA",
      "CMP",
      "CALHIV",
      "HEI",
      "CALHIV SERVED",
      "HEI SERVED",
      "SERVED %",
      "OUTSTANDING"
    ]);

    // Populate data groups
    sortedCcwGroups.forEach(g => {
      // Add LGA summary row
      rows.push([
        `LGA TOTAL: ${g.lgaName.toUpperCase()}`,
        g.cmp,
        g.calhiv,
        g.hei,
        g.calhivServed,
        g.heiServed,
        `${g.servedPercent}%`,
        g.outstanding
      ]);

      // Add child CCWs
      g.ccws.forEach(c => {
        rows.push([
          `  ${c.ccwName}`,
          c.cmp,
          c.calhiv,
          c.hei,
          c.calhivServed,
          c.heiServed,
          `${c.servedPercent}%`,
          c.outstanding
        ]);
      });
    });

    // Grand Totals Row
    rows.push([]);
    rows.push([
      "GRAND TOTAL",
      performanceData.overallTotal.cmp,
      performanceData.overallTotal.calhiv,
      performanceData.overallTotal.hei,
      performanceData.overallTotal.calhivServed,
      performanceData.overallTotal.heiServed,
      `${performanceData.overallTotal.servedPercent}%`,
      performanceData.overallTotal.outstanding
    ]);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Apply column widths for pristine layout
    ws["!cols"] = [
      { wch: 32 }, // LGA / CCW Name
      { wch: 10 }, // CMP
      { wch: 10 }, // CALHIV
      { wch: 10 }, // HEI
      { wch: 15 }, // CALHIV Served
      { wch: 15 }, // HEI Served
      { wch: 12 }, // Served %
      { wch: 14 }  // Outstanding
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Performance");
    XLSX.writeFile(wb, `CCW_Monthly_Performance_Report_${filters.ReportingPeriod}.xlsx`);
  };

  // 2. Export to PDF (using html2canvas & jspdf)
  const handleExportPDF = () => {
    const reportElem = document.getElementById("ccw-report-print-area");
    if (!reportElem) return;

    html2canvas(reportElem, {
      scale: 1.5,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff"
    }).then(canvas => {
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`CCW_Monthly_Performance_Report_${filters.ReportingPeriod}.pdf`);
    });
  };

  // 3. Export to Word (Structured HTML wrapper)
  const handleExportWord = () => {
    let wordHtml = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>CCW Monthly Performance Report</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
          h2 { color: #1e3a8a; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 11px; font-weight: bold; }
          td { border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 11px; }
          .lga-total-row { background-color: #fef08a; font-weight: bold; font-size: 12px; border: 1px solid #b45309; }
          .grand-total-row { background-color: #e2e8f0; font-weight: bold; font-size: 12px; }
          .text-right { text-align: right; }
          .indent { padding-left: 15px; }
        </style>
      </head>
      <body>
        <h2>CCW Monthly Performance Report</h2>
        <p><strong>Reporting Period:</strong> ${filters.ReportingPeriod}</p>
        <p><strong>Generated On:</strong> ${new Date().toLocaleDateString()}</p>
        <table>
          <thead>
            <tr>
              <th>LGA</th>
              <th class="text-right">CMP</th>
              <th class="text-right">CALHIV</th>
              <th class="text-right">HEI</th>
              <th class="text-right">CALHIV SERVED</th>
              <th class="text-right">HEI SERVED</th>
              <th class="text-right">SERVED %</th>
              <th class="text-right">OUTSTANDING</th>
            </tr>
          </thead>
          <tbody>
    `;

    sortedCcwGroups.forEach(g => {
      wordHtml += `
        <tr class="lga-total-row">
          <td>${g.lgaName.toUpperCase()} (LGA Total)</td>
          <td class="text-right">${g.cmp.toLocaleString()}</td>
          <td class="text-right">${g.calhiv.toLocaleString()}</td>
          <td class="text-right">${g.hei.toLocaleString()}</td>
          <td class="text-right">${g.calhivServed.toLocaleString()}</td>
          <td class="text-right">${g.heiServed.toLocaleString()}</td>
          <td class="text-right">${g.servedPercent}%</td>
          <td class="text-right">${g.outstanding.toLocaleString()}</td>
        </tr>
      `;

      g.ccws.forEach(c => {
        wordHtml += `
          <tr>
            <td class="indent">${c.ccwName}</td>
            <td class="text-right">${c.cmp.toLocaleString()}</td>
            <td class="text-right">${c.calhiv.toLocaleString()}</td>
            <td class="text-right">${c.hei.toLocaleString()}</td>
            <td class="text-right">${c.calhivServed.toLocaleString()}</td>
            <td class="text-right">${c.heiServed.toLocaleString()}</td>
            <td class="text-right">${c.servedPercent}%</td>
            <td class="text-right">${c.outstanding.toLocaleString()}</td>
          </tr>
        `;
      });
    });

    wordHtml += `
          <tr class="grand-total-row">
            <td>GRAND TOTAL</td>
            <td class="text-right">${performanceData.overallTotal.cmp.toLocaleString()}</td>
            <td class="text-right">${performanceData.overallTotal.calhiv.toLocaleString()}</td>
            <td class="text-right">${performanceData.overallTotal.hei.toLocaleString()}</td>
            <td class="text-right">${performanceData.overallTotal.calhivServed.toLocaleString()}</td>
            <td class="text-right">${performanceData.overallTotal.heiServed.toLocaleString()}</td>
            <td class="text-right">${performanceData.overallTotal.servedPercent}%</td>
            <td class="text-right">${performanceData.overallTotal.outstanding.toLocaleString()}</td>
          </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([wordHtml], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CCW_Monthly_Performance_Report_${filters.ReportingPeriod}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 4. Export to PowerPoint (HTML slide briefing package)
  const handleExportPPT = () => {
    let pptHtml = `
      <html>
      <head>
        <title>CCW Monthly Performance briefing slides</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: white; padding: 45px; }
          .slide { background-color: #1e293b; border-radius: 12px; padding: 40px; margin-bottom: 50px; min-height: 520px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #334155; page-break-after: always; }
          h1 { color: #fef08a; font-size: 34px; font-weight: 800; margin-bottom: 5px; }
          h2 { color: #38bdf8; font-size: 20px; font-weight: 600; margin-bottom: 25px; border-bottom: 1px solid #475569; pb-2; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 35px; }
          .kpi-card { background-color: #0f172a; padding: 25px; border-radius: 8px; border-top: 4px solid #eab308; text-align: center; }
          .kpi-val { font-size: 38px; font-weight: 900; color: #fef08a; font-family: monospace; mt-2; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; color: #cbd5e1; }
          th { background-color: #0f172a; text-align: left; padding: 10px; border-bottom: 2px solid #334155; font-size: 11px; font-weight: 700; uppercase; }
          td { padding: 8px 10px; border-bottom: 1px solid #334155; font-size: 11px; }
          .highlight { color: #eab308; font-weight: bold; }
          .coverage-cell { font-weight: bold; color: #10b981; }
        </style>
      </head>
      <body>
        <div class="slide">
          <h1>CCW MONTHLY PERFORMANCE REPORT</h1>
          <h2>Executive Performance Summary Slide</h2>
          <p class="text-sm text-slate-400">Reporting Window: <span class="highlight">${filters.ReportingPeriod}</span></p>
          <div class="grid">
            <div class="kpi-card">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-400">Total Active Targets (CMP)</div>
              <div class="kpi-val">${performanceData.overallTotal.cmp.toLocaleString()}</div>
            </div>
            <div class="kpi-card" style="border-top-color: #3b82f6;">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-400">CALHIV Served</div>
              <div class="kpi-val" style="color: #60a5fa;">${performanceData.overallTotal.calhivServed.toLocaleString()}</div>
            </div>
            <div class="kpi-card" style="border-top-color: #10b981;">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-400">HEI Served</div>
              <div class="kpi-val" style="color: #34d399;">${performanceData.overallTotal.heiServed.toLocaleString()}</div>
            </div>
            <div class="kpi-card" style="border-top-color: #f43f5e;">
              <div class="text-xs font-bold uppercase tracking-wider text-slate-400">Total Outstanding</div>
              <div class="kpi-val" style="color: #f43f5e;">${performanceData.overallTotal.outstanding.toLocaleString()}</div>
            </div>
          </div>
          <div class="mt-8 text-center" style="font-size: 24px; font-weight: 700; color: #34d399;">
            Overall Program Coverage: ${performanceData.overallTotal.servedPercent}%
          </div>
        </div>
        
        <div class="slide">
          <h1>LGA PERFORMANCE STANDINGS</h1>
          <h2>Regional Performance Breakdown</h2>
          <table>
            <thead>
              <tr>
                <th>LGA</th>
                <th>Active CMP</th>
                <th>CALHIV Served</th>
                <th>HEI Served</th>
                <th>Outstanding</th>
                <th>Coverage %</th>
              </tr>
            </thead>
            <tbody>
    `;

    sortedCcwGroups.slice(0, 10).forEach(g => {
      pptHtml += `
        <tr>
          <td class="highlight">${g.lgaName.toUpperCase()}</td>
          <td>${g.cmp.toLocaleString()}</td>
          <td>${g.calhivServed.toLocaleString()}</td>
          <td>${g.heiServed.toLocaleString()}</td>
          <td>${g.outstanding.toLocaleString()}</td>
          <td class="coverage-cell">${g.servedPercent}%</td>
        </tr>
      `;
    });

    pptHtml += `
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([pptHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CCW_Monthly_Performance_Briefing_${filters.ReportingPeriod}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Recharts Chart Data Processing
  const chartDataLga = useMemo(() => {
    return sortedCcwGroups.map(g => ({
      name: g.lgaName,
      CMP: g.cmp,
      Served: g.calhivServed + g.heiServed,
      Outstanding: g.outstanding,
      CALHIVServed: g.calhivServed,
      HEIServed: g.heiServed,
      CALHIV: g.calhiv,
      HEI: g.hei,
      Coverage: g.servedPercent
    }));
  }, [sortedCcwGroups]);

  const chartDataRanking = useMemo(() => {
    // Flatten and sort CCWs by Coverage to get rank list
    const list: any[] = [];
    performanceData.groups.forEach(g => {
      g.ccws.forEach(c => {
        list.push({
          name: c.ccwName,
          LGA: c.lga,
          Coverage: c.servedPercent,
          Served: c.calhivServed + c.heiServed,
          CMP: c.cmp
        });
      });
    });
    return list.sort((a, b) => b.Coverage - a.Coverage).slice(0, 10);
  }, [performanceData]);

  // Beneficiary details filtered for modal click
  const ccwDetailsBeneficiaries = useMemo(() => {
    if (!selectedCcwForDetails) return [];
    return beneficiaries.filter(b => {
      const bCcw = b.CCWName || "Unassigned CCW";
      const bLga = b.LGA || "Unassigned LGA";
      return (
        bCcw === selectedCcwForDetails.ccwName &&
        bLga === selectedCcwForDetails.lga &&
        b.OVCStatus === "Active"
      );
    });
  }, [selectedCcwForDetails, beneficiaries]);

  return (
    <div className="flex flex-col lg:flex-row gap-4" id="reports-view">
      {/* Category Sidebar */}
      <div className="w-full lg:w-60 shrink-0 space-y-4">
        <div className="p-3.5 bg-slate-100 border border-slate-300 rounded shadow-xs">
          <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-widest mb-3 px-1 border-b border-slate-200 pb-1.5">
            CAPRS Report Index
          </h3>
          
          <nav className="space-y-4">
            {categories.map((cat, idx) => (
              <div key={idx} className="space-y-1">
                <h4 className="text-[9px] font-bold text-slate-500 flex items-center gap-1.5 px-1 uppercase tracking-wider">
                  {cat.icon}
                  {cat.title}
                </h4>
                <div className="space-y-0.5">
                  {cat.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleReportChange(item.id as ReportType)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded font-medium transition-all cursor-pointer ${
                        activeReport === item.id
                          ? "bg-blue-600 text-white font-bold shadow-sm scale-[1.02]"
                          : "text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                      }`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Report Table Area */}
      <div className="flex-1 bg-white border border-slate-300 rounded shadow-sm overflow-hidden flex flex-col">
        
        {/* MATHEMATICAL VALIDATION ALERTS PANEL */}
        {activeReport === "ccw" && performanceData.validationErrors.length > 0 && (
          <div className="m-3 p-3 bg-red-50 border border-red-200 text-red-800 rounded animate-fade-in flex flex-col gap-2 shadow-xs">
            <div className="flex items-center gap-2 text-red-700 font-bold text-xs uppercase tracking-wide">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              M&E Engine: Math Discrepancy Found ({performanceData.validationErrors.length})
            </div>
            <p className="text-[11px] text-red-600">
              The following entities have failed mathematical validation audits. Please adjust source data rows:
            </p>
            <div className="max-h-24 overflow-y-auto divide-y divide-red-100 text-[11px] font-mono bg-white p-2 rounded border border-red-100">
              {performanceData.validationErrors.map((err, errIdx) => (
                <div key={errIdx} className="py-1 first:pt-0 last:pb-0">
                  ⚠️ {err.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dynamic Metrics Header for specialized clinical reports */}
        {activeReport === "vl" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 border-b border-slate-300">
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Tested</span>
              <p className="text-base font-bold text-slate-700 mt-0.5">{vlData.vlCarriedOut}</p>
            </div>
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Suppressed</span>
              <p className="text-base font-bold text-emerald-600 mt-0.5">{vlData.vlSuppressed}</p>
            </div>
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Unsuppressed</span>
              <p className="text-base font-bold text-red-500 mt-0.5">{vlData.vlUnsuppressed}</p>
            </div>
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Suppression Rate</span>
              <p className="text-base font-bold text-blue-600 mt-0.5">{vlData.suppressionRate.toFixed(1)}%</p>
            </div>
          </div>
        )}

        {activeReport === "tb" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 border-b border-slate-300">
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Screened (TB)</span>
              <p className="text-base font-bold text-slate-700 mt-0.5">
                {tbData.screened} <span className="text-xs text-slate-400">({((tbData.screened / Math.max(tbData.totalActive, 1)) * 100).toFixed(0)}%)</span>
              </p>
            </div>
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Symptomatic</span>
              <p className="text-base font-bold text-amber-600 mt-0.5">{tbData.symptomatic}</p>
            </div>
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">TPT Commenced</span>
              <p className="text-base font-bold text-emerald-600 mt-0.5">{tbData.commencedTpt}</p>
            </div>
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">TPT Completed</span>
              <p className="text-base font-bold text-blue-600 mt-0.5">{tbData.completedTpt}</p>
            </div>
          </div>
        )}

        {activeReport === "hei" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 border-b border-slate-300">
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Active HEI Target</span>
              <p className="text-base font-bold text-slate-700 mt-0.5">{heiData.totalActiveHEI}</p>
            </div>
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">1st PCR Pos / Neg</span>
              <p className="text-base font-bold text-slate-700 mt-0.5">
                <span className="text-red-500">{heiData.pcr1Positive}</span> / <span className="text-emerald-600">{heiData.pcr1Negative}</span>
              </p>
            </div>
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">2nd PCR Pos / Neg</span>
              <p className="text-base font-bold text-slate-700 mt-0.5">
                <span className="text-red-500">{heiData.pcr2Positive}</span> / <span className="text-emerald-600">{heiData.pcr2Negative}</span>
              </p>
            </div>
            <div className="p-2.5 bg-white border border-slate-300 rounded text-center md:text-left">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Active HEI Tracking</span>
              <p className="text-base font-bold text-blue-600 mt-0.5">{heiData.heiTrackingActive}</p>
            </div>
          </div>
        )}

        {activeReport === "status" && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 p-3 bg-slate-50 border-b border-slate-300">
            <div className="p-2 bg-white border border-slate-300 rounded text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Active</span>
              <p className="text-sm font-bold text-emerald-600 mt-0.5">{statusData.Active}</p>
            </div>
            <div className="p-2 bg-white border border-slate-300 rounded text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Inactive</span>
              <p className="text-sm font-bold text-slate-600 mt-0.5">{statusData.Inactive}</p>
            </div>
            <div className="p-2 bg-white border border-slate-300 rounded text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Migrated</span>
              <p className="text-sm font-bold text-slate-500 mt-0.5">{statusData.Migrated}</p>
            </div>
            <div className="p-2 bg-white border border-slate-300 rounded text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Exited</span>
              <p className="text-sm font-bold text-slate-500 mt-0.5">{statusData.Exited}</p>
            </div>
            <div className="p-2 bg-white border border-slate-300 rounded text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Deceased</span>
              <p className="text-sm font-bold text-red-500 mt-0.5">{statusData.Deceased}</p>
            </div>
            <div className="p-2 bg-white border border-slate-300 rounded text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Transferred</span>
              <p className="text-sm font-bold text-orange-500 mt-0.5">{statusData.TransferredOut}</p>
            </div>
          </div>
        )}

        {activeReport === "dq" && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 bg-slate-50 border-b border-slate-300">
            <div className="p-2 bg-white border border-slate-300 rounded text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Total Rows</span>
              <p className="text-sm font-bold text-slate-700 mt-0.5">{dataQualitySummary.totalRecords}</p>
            </div>
            <div className="p-2 bg-white border border-slate-300 rounded text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Duplicate VC IDs</span>
              <p className="text-sm font-bold text-red-600 mt-0.5">{dataQualitySummary.duplicateVcIds}</p>
            </div>
            <div className="p-2 bg-white border border-slate-300 rounded text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Blank CCW</span>
              <p className="text-sm font-bold text-amber-600 mt-0.5">{dataQualitySummary.blankCcws}</p>
            </div>
            <div className="p-2 bg-white border border-slate-300 rounded text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Blank Comm.</span>
              <p className="text-sm font-bold text-amber-600 mt-0.5">{dataQualitySummary.blankCommunities}</p>
            </div>
            <div className="p-2 bg-white border border-slate-300 rounded text-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase">Invalid Dates</span>
              <p className="text-sm font-bold text-red-600 mt-0.5">{dataQualitySummary.invalidDates}</p>
            </div>
          </div>
        )}

        {/* Search, Exporters, and Filter Controls Section */}
        <div className="p-3 border-b border-slate-300 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase text-slate-800 tracking-tight">
                {activeReport === "ccw" ? `CCW Monthly Performance Report` : reportTitle}
              </h2>
              <span className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 font-bold px-1.5 py-0.5 rounded">
                {activeReport === "ccw"
                  ? `${performanceData.groups.reduce((acc, x) => acc + x.ccws.length, 0)} CCWs`
                  : `${tableContent.rows.length} rows`}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">
              Window: <span className="text-slate-600 font-bold">{filters.ReportingPeriod}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* EXPORT ACTION DROPDOWN FOR CCW REPORT */}
            {activeReport === "ccw" && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowCharts(prev => !prev)}
                  className="flex items-center gap-1 text-[11px] font-bold bg-white border border-slate-300 text-slate-700 px-2 py-1.5 rounded hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                >
                  <BarChart2 className="w-3 h-3 text-blue-600" />
                  {showCharts ? "Hide Charts" : "Show Charts"}
                </button>

                <div className="flex items-center bg-white border border-slate-300 rounded shadow-2xs divide-x divide-slate-200">
                  <span className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                    <Download className="w-3 h-3 text-slate-400" /> EXPORT
                  </span>
                  <button
                    onClick={handleExportExcel}
                    className="px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 hover:text-emerald-700 transition-colors cursor-pointer"
                    title="Export to formatted Microsoft Excel Worksheet"
                  >
                    EXCEL
                  </button>
                  <button
                    onClick={handleExportPDF}
                    className="px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 hover:text-red-600 transition-colors cursor-pointer"
                    title="Export to PDF presentation grid"
                  >
                    PDF
                  </button>
                  <button
                    onClick={handleExportWord}
                    className="px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition-colors cursor-pointer"
                    title="Export to formatted Microsoft Word Document"
                  >
                    WORD
                  </button>
                  <button
                    onClick={handleExportPPT}
                    className="px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 hover:text-amber-600 transition-colors cursor-pointer"
                    title="Export to dynamic slide deck"
                  >
                    SLIDES
                  </button>
                </div>
              </div>
            )}

            {/* Standard Search query for generic reports */}
            {activeReport !== "ccw" && (
              <div className="relative">
                <Search className="absolute left-2 top-2.5 w-3 h-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search report..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                  className="pl-7 pr-3 py-1.5 text-xs border border-slate-300 rounded bg-white focus:border-blue-500 outline-none w-44"
                />
              </div>
            )}

            {activeReport !== "ccw" && (
              <select
                value={rowsPerPage}
                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="text-xs border border-slate-300 rounded bg-white px-2 py-1.5 focus:border-blue-500 outline-none"
              >
                <option value={15}>15 rows</option>
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
              </select>
            )}
          </div>
        </div>

        {/* INDEPENDENT SEARCH PANEL SPECIFICALLY FOR THE GROUPED CCW REPORT */}
        {activeReport === "ccw" && (
          <div className="p-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2 animate-fade-in shadow-2xs">
            {/* Search CCW */}
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest pointer-events-none">
                CCW
              </span>
              <input
                type="text"
                placeholder="Search CCW name..."
                value={ccwSearchQuery}
                onChange={(e) => setCcwSearchQuery(e.target.value)}
                className="w-full pl-12 pr-3 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
              {ccwSearchQuery && (
                <button onClick={() => setCcwSearchQuery("")} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search Community */}
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest pointer-events-none">
                Comm
              </span>
              <input
                type="text"
                placeholder="Search Community..."
                value={communitySearchQuery}
                onChange={(e) => setCommunitySearchQuery(e.target.value)}
                className="w-full pl-13 pr-3 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
              {communitySearchQuery && (
                <button onClick={() => setCommunitySearchQuery("")} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Search LGA */}
            <div className="relative">
              <span className="absolute left-2.5 top-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest pointer-events-none">
                LGA
              </span>
              <input
                type="text"
                placeholder="Search Local Govt Area..."
                value={lgaSearchQuery}
                onChange={(e) => setLgaSearchQuery(e.target.value)}
                className="w-full pl-11 pr-3 py-1.5 text-xs font-semibold border border-slate-300 rounded bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
              />
              {lgaSearchQuery && (
                <button onClick={() => setLgaSearchQuery("")} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* REPORT CHARTS: DYNAMICALLY RENDERED DIRECTLY LINKED TO THE REPORT */}
        {activeReport === "ccw" && showCharts && (
          <div className="p-4 bg-slate-50 border-b border-slate-300 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in shadow-2xs max-h-[290px] overflow-y-auto">
            
            {/* Chart 1: LGA Performance */}
            <div className="p-3.5 bg-white border border-slate-300 rounded shadow-2xs flex flex-col h-[220px]">
              <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">1. LGA Target vs Served</h4>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataLga.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={8} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: "10px", borderRadius: "2px" }} />
                    <Legend iconSize={5} wrapperStyle={{ fontSize: "8px" }} />
                    <Bar dataKey="CMP" fill="#475569" name="Target" radius={[1, 1, 0, 0]} />
                    <Bar dataKey="Served" fill="#2563eb" name="Served" radius={[1, 1, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: CCW Ranking */}
            <div className="p-3.5 bg-white border border-slate-300 rounded shadow-2xs flex flex-col h-[220px]">
              <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">2. CCW Coverage Standings (Top 10 %)</h4>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataRanking} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" stroke="#94a3b8" fontSize={8} />
                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={7} tickLine={false} width={65} />
                    <Tooltip contentStyle={{ fontSize: "10px", borderRadius: "2px" }} />
                    <Bar dataKey="Coverage" fill="#10b981" name="Coverage %" radius={[0, 1, 1, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 3: Outstanding by LGA */}
            <div className="p-3.5 bg-white border border-slate-300 rounded shadow-2xs flex flex-col h-[220px]">
              <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">3. Outstanding Target by LGA</h4>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataLga.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={8} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: "10px", borderRadius: "2px" }} />
                    <Bar dataKey="Outstanding" fill="#ef4444" name="Outstanding" radius={[1, 1, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 4: CALHIV Served */}
            <div className="p-3.5 bg-white border border-slate-300 rounded shadow-2xs flex flex-col h-[220px]">
              <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">4. CALHIV Cohort Served Ratio</h4>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataLga.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={8} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: "10px", borderRadius: "2px" }} />
                    <Legend iconSize={5} wrapperStyle={{ fontSize: "8px" }} />
                    <Bar dataKey="CALHIV" fill="#64748b" name="CALHIV Target" />
                    <Bar dataKey="CALHIVServed" fill="#3b82f6" name="CALHIV Served" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 5: HEI Served */}
            <div className="p-3.5 bg-white border border-slate-300 rounded shadow-2xs flex flex-col h-[220px]">
              <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">5. HEI Cohort Served Ratio</h4>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartDataLga.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={8} tickLine={false} />
                    <Tooltip contentStyle={{ fontSize: "10px", borderRadius: "2px" }} />
                    <Legend iconSize={5} wrapperStyle={{ fontSize: "8px" }} />
                    <Bar dataKey="HEI" fill="#cbd5e1" name="HEI Target" />
                    <Bar dataKey="HEIServed" fill="#10b981" name="HEI Served" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 6: Coverage % Standings */}
            <div className="p-3.5 bg-white border border-slate-300 rounded shadow-2xs flex flex-col h-[220px]">
              <h4 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">6. LGA Coverage Density (%)</h4>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartDataLga.slice(0, 8)}>
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={8} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={8} unit="%" />
                    <Tooltip contentStyle={{ fontSize: "10px", borderRadius: "2px" }} />
                    <Area type="monotone" dataKey="Coverage" fill="#dbeafe" stroke="#3b82f6" name="Coverage %" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}

        {/* Scrollable Table Container */}
        <div className="flex-1 overflow-x-auto" id="ccw-report-print-area">
          {activeReport === "ccw" ? (
            /* CCW MONTHLY PERFORMANCE REPORT GROUPED TABLE LAYOUT */
            <table className="w-full border-collapse text-left min-w-[800px] bg-white border border-slate-200">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th
                    onClick={() => handleSort("lga")}
                    className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-3.5 cursor-pointer hover:bg-slate-200 transition-colors sticky left-0 bg-slate-100 z-10 border-r border-slate-200"
                  >
                    <div className="flex items-center gap-1">
                      LGA
                      {sortColumn === "lga" && (sortDirection === "asc" ? "▲" : "▼")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("cmp")}
                    className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-3.5 text-right cursor-pointer hover:bg-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      CMP
                      {sortColumn === "cmp" && (sortDirection === "asc" ? "▲" : "▼")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("calhiv")}
                    className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-3.5 text-right cursor-pointer hover:bg-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      CALHIV
                      {sortColumn === "calhiv" && (sortDirection === "asc" ? "▲" : "▼")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("hei")}
                    className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-3.5 text-right cursor-pointer hover:bg-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      HEI
                      {sortColumn === "hei" && (sortDirection === "asc" ? "▲" : "▼")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("calhivServed")}
                    className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-3.5 text-right cursor-pointer hover:bg-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      CALHIV SERVED
                      {sortColumn === "calhivServed" && (sortDirection === "asc" ? "▲" : "▼")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("heiServed")}
                    className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-3.5 text-right cursor-pointer hover:bg-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      HEI SERVED
                      {sortColumn === "heiServed" && (sortDirection === "asc" ? "▲" : "▼")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("servedPercent")}
                    className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-3.5 text-right cursor-pointer hover:bg-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      SERVED %
                      {sortColumn === "servedPercent" && (sortDirection === "asc" ? "▲" : "▼")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("outstanding")}
                    className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3 py-3.5 text-right cursor-pointer hover:bg-slate-200 transition-colors"
                  >
                    <div className="flex items-center justify-end gap-1">
                      OUTSTANDING
                      {sortColumn === "outstanding" && (sortDirection === "asc" ? "▲" : "▼")}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="text-xs font-semibold text-slate-700 divide-y divide-slate-150">
                {sortedCcwGroups.length > 0 ? (
                  sortedCcwGroups.map((group, gIdx) => (
                    <React.Fragment key={gIdx}>
                      
                      {/* LGA SUMMARY ROW (Yellow/Gold, Bold, Large text, Drilldown click trigger) */}
                      <tr
                        onClick={() => handleLgaClick(group.lgaName)}
                        className="bg-[#fef08a] hover:bg-yellow-200 text-yellow-950 font-extrabold text-xs transition-colors cursor-pointer border-y border-amber-300"
                        title="Click to drilldown Community Performance for this LGA"
                      >
                        <td className="px-3 py-3.5 font-extrabold sticky left-0 bg-[#fef08a] hover:bg-yellow-200 z-10 border-r border-amber-200 uppercase tracking-wide">
                          ⭐ {group.lgaName} (LGA Total)
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold">
                          {group.cmp.toLocaleString()}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold">
                          {group.calhiv.toLocaleString()}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold">
                          {group.hei.toLocaleString()}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold">
                          {group.calhivServed.toLocaleString()}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold">
                          {group.heiServed.toLocaleString()}
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold text-blue-800">
                          {group.servedPercent}%
                        </td>
                        <td className="px-3 py-3.5 text-right font-mono font-bold text-red-700">
                          {group.outstanding.toLocaleString()}
                        </td>
                      </tr>

                      {/* INDIVIDUAL alphabetically-sorted CCWs under this LGA */}
                      {group.ccws.map((ccw, cIdx) => (
                        <tr
                          key={cIdx}
                          onClick={() => setSelectedCcwForDetails(ccw)}
                          className="bg-white hover:bg-slate-50 transition-colors cursor-pointer text-[11px] text-slate-600"
                          title={`Click to view ${ccw.ccwName}'s active beneficiary list`}
                        >
                          <td className="px-3 py-2.5 font-medium pl-8 sticky left-0 bg-inherit hover:bg-slate-50 z-10 border-r border-slate-150 text-slate-800">
                            {ccw.ccwName}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium">
                            {ccw.cmp.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium">
                            {ccw.calhiv.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium">
                            {ccw.hei.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium text-blue-600/90">
                            {ccw.calhivServed.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-medium text-emerald-600/90">
                            {ccw.heiServed.toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-700">
                            {ccw.servedPercent}%
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-semibold text-red-500">
                            {ccw.outstanding.toLocaleString()}
                          </td>
                        </tr>
                      ))}

                    </React.Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="text-center py-16 text-slate-400 font-normal">
                      No active CCW performance records match your search criteria. Try removing or resetting filters.
                    </td>
                  </tr>
                )}

                {/* GRAND TOTAL ROW */}
                {sortedCcwGroups.length > 0 && (
                  <tr className="bg-slate-200 border-t-2 border-slate-400 text-slate-900 font-black text-xs">
                    <td className="px-3 py-3.5 font-black sticky left-0 bg-slate-200 z-10 border-r border-slate-300 uppercase">
                      GRAND TOTAL
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-black">
                      {performanceData.overallTotal.cmp.toLocaleString()}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-black">
                      {performanceData.overallTotal.calhiv.toLocaleString()}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-black">
                      {performanceData.overallTotal.hei.toLocaleString()}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-black">
                      {performanceData.overallTotal.calhivServed.toLocaleString()}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-black">
                      {performanceData.overallTotal.heiServed.toLocaleString()}
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-black text-blue-900">
                      {performanceData.overallTotal.servedPercent}%
                    </td>
                    <td className="px-3 py-3.5 text-right font-mono font-black text-red-800">
                      {performanceData.overallTotal.outstanding.toLocaleString()}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            /* STANDARD TABLE RENDERER FOR OTHER ANALYTICS REPORTS */
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  {tableContent.headers.map((h, idx) => (
                    <th key={idx} className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-3 py-2.5">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs text-slate-600 font-semibold">
                {paginatedRows.length > 0 ? (
                  paginatedRows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-slate-50 transition-colors">
                      {row.map((val: any, colIdx: number) => {
                        let cellClass = "px-3 py-2.5 border-r border-slate-100 last:border-r-0";
                        if (activeReport === "dq" && colIdx === 2) {
                          if (val === "High") cellClass += " text-red-600 font-bold";
                          else if (val === "Medium") cellClass += " text-amber-600 font-semibold";
                          else cellClass += " text-slate-500";
                        } else if (val === "URGENT EAC SEQUENCE") {
                          cellClass += " text-red-600 font-bold bg-red-50";
                        } else if (val === "Active") {
                          cellClass += " text-emerald-600 font-bold";
                        } else if (val === "Deceased") {
                          cellClass += " text-red-600 font-bold";
                        }
                        return (
                          <td key={colIdx} className={cellClass}>
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={tableContent.headers.length} className="text-center py-12 text-xs text-slate-400 font-normal">
                      No matching records found. Try adjusting your search query or upload active data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* PAGINATION CONTROLS FOR STANDARD LIST VIEWS */}
        {activeReport !== "ccw" && (
          <div className="p-3 border-t border-slate-300 flex items-center justify-between bg-slate-50">
            <span className="text-[10px] text-slate-400 font-semibold">
              Showing {Math.min((currentPage - 1) * rowsPerPage + 1, tableContent.rows.length)}-
              {Math.min(currentPage * rowsPerPage, tableContent.rows.length)} of {tableContent.rows.length} rows
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1 border border-slate-300 bg-white hover:bg-slate-100 rounded text-slate-500 disabled:opacity-40 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-slate-600 font-bold px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1 border border-slate-300 bg-white hover:bg-slate-100 rounded text-slate-500 disabled:opacity-40 transition-all cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* BENEFICIARY ROSTER DETAIL MODAL ON CCW CLICK */}
      {selectedCcwForDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            
            {/* Modal Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                    {selectedCcwForDetails.ccwName} — Beneficiary Audit Roster
                  </h3>
                </div>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  Location: {selectedCcwForDetails.community}, LGA: {selectedCcwForDetails.lga}
                </p>
              </div>
              <button
                onClick={() => setSelectedCcwForDetails(null)}
                className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-850 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Stats Overview */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-slate-100/60 border-b border-slate-200 text-center">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Active CMP</span>
                <p className="text-base font-extrabold text-slate-700 font-mono mt-0.5">{selectedCcwForDetails.cmp}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block text-blue-500">CALHIV Served</span>
                <p className="text-base font-extrabold text-blue-600 font-mono mt-0.5">{selectedCcwForDetails.calhivServed}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block text-emerald-600">HEI Served</span>
                <p className="text-base font-extrabold text-emerald-600 font-mono mt-0.5">{selectedCcwForDetails.heiServed}</p>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block text-red-500">Outstanding</span>
                <p className="text-base font-extrabold text-red-500 font-mono mt-0.5">{selectedCcwForDetails.outstanding}</p>
              </div>
            </div>

            {/* Modal Roster List */}
            <div className="flex-1 overflow-y-auto p-4">
              {ccwDetailsBeneficiaries.length > 0 ? (
                <table className="w-full text-left border-collapse border border-slate-200 text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-[9px] text-slate-500">VC ID</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-[9px] text-slate-500">Child Name</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-[9px] text-slate-500">Sex/Age</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-[9px] text-slate-500">Stream</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-[9px] text-slate-500">Latest Service Date</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-[9px] text-slate-500 text-right">M&E Period Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 font-medium text-slate-600">
                    {ccwDetailsBeneficiaries.map((b, bIdx) => {
                      const isServed = b.DateOfLatestServiceProvided && isDateInReportingPeriod(
                        parseDate(b.DateOfLatestServiceProvided)!,
                        filters.ReportingPeriod,
                        filters.StartDate,
                        filters.EndDate,
                        targetDate
                      );

                      return (
                        <tr key={bIdx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2 font-mono font-bold text-slate-800">{b.VCUniqueID}</td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{b.ChildName || "Anonymous"}</td>
                          <td className="px-3 py-2">{b.Sex} ({b.Age} {b.AgeUnit})</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              b.EnrolmentStream === "CALHIV" ? "bg-blue-100 text-blue-700" : "bg-teal-100 text-teal-700"
                            }`}>
                              {b.EnrolmentStream}
                            </span>
                          </td>
                          <td className="px-3 py-2">{b.DateOfLatestServiceProvided || "None"}</td>
                          <td className="px-3 py-2 text-right">
                            {isServed ? (
                              <span className="text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded font-extrabold flex items-center justify-end gap-1">
                                <CheckCircle className="w-3 h-3" /> SERVED ✓
                              </span>
                            ) : (
                              <span className="text-[10px] bg-red-50 text-red-500 border border-red-150 px-1.5 py-0.5 rounded font-bold">
                                ⏳ OUTSTANDING
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  No active beneficiaries currently assigned to this CCW.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                onClick={() => setSelectedCcwForDetails(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-950 text-white rounded text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                CLOSE AUDIT
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
