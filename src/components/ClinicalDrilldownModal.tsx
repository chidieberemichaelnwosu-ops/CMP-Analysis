/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { Search, X, Download, Printer, FileSpreadsheet, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { prepareStylesheetsForHtml2Canvas } from "../utils/cssSanitizer";
import { Beneficiary } from "../types";
import { parseDate } from "../utils/reportingEngine";
import { calculateDaysOverdue, getIITFollowUpAction } from "../utils/clinicalAlertsEngine";

export type DrilldownType =
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

interface ClinicalDrilldownModalProps {
  isOpen: boolean;
  title: string;
  type: DrilldownType;
  beneficiaries: Beneficiary[];
  onClose: () => void;
  targetDate?: Date; // Added targetDate as optional parameter to correctly parse days overdue
}

interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
}

export default function ClinicalDrilldownModal({
  isOpen,
  title,
  type,
  beneficiaries,
  onClose,
  targetDate = new Date(2026, 5, 15) // Default fallback
}: ClinicalDrilldownModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState("All");
  const [lgaFilter, setLgaFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortField, setSortField] = useState<string>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  if (!isOpen) return null;

  // 1. Get unique LGAs in the current list for inside-modal filtering
  const uniqueLgas = useMemo(() => {
    const lgas = new Set<string>();
    beneficiaries.forEach((b) => {
      if (b.LGA) lgas.add(b.LGA);
    });
    return Array.from(lgas).sort();
  }, [beneficiaries]);

  // 2. Select columns based on drilldown type
  const columns = useMemo<TableColumn[]>(() => {
    const baseCols: TableColumn[] = [
      { key: "id", label: "VC Unique ID", sortable: true },
      { key: "name", label: "Child Name", sortable: true },
      { key: "age", label: "Age", sortable: true },
      { key: "sex", label: "Sex", sortable: true },
      { key: "community", label: "Community" },
      { key: "lga", label: "LGA", sortable: true },
      { key: "ccw", label: "CCW Name", sortable: true }
    ];

    switch (type) {
      case "no_bmi":
        return [
          ...baseCols,
          { key: "weight", label: "Weight" },
          { key: "height", label: "Height" },
          { key: "bmi", label: "BMI" },
          { key: "nutrition", label: "Nutrition Status", sortable: true },
          { key: "services", label: "Latest Services" },
          { key: "serviceDate", label: "Latest Service Date", sortable: true },
          { key: "caregiver", label: "Caregiver Name" },
          { key: "phone", label: "Caregiver Phone" }
        ];
      case "viral_load_sample":
        return [
          ...baseCols,
          { key: "art_status", label: "Current ART Status" },
          { key: "vl_sample_date", label: "VL Sample Date" },
          { key: "caregiver", label: "Caregiver Name" },
          { key: "phone", label: "Caregiver Phone" }
        ];
      case "viral_load_result":
        return [
          ...baseCols,
          { key: "vl_carried_out", label: "VL Carried Out" },
          { key: "vl_result", label: "VL Result" },
          { key: "caregiver", label: "Caregiver Name" },
          { key: "phone", label: "Caregiver Phone" }
        ];
      case "viral_load_date":
        return [
          ...baseCols,
          { key: "vl_carried_out", label: "VL Carried Out" },
          { key: "vl_date", label: "Date of VL" },
          { key: "caregiver", label: "Caregiver Name" },
          { key: "phone", label: "Caregiver Phone" }
        ];
      case "unsuppressed":
        return [
          ...baseCols,
          { key: "vl_result", label: "Last VL Result" },
          { key: "vl_date", label: "Date of VL" },
          { key: "art_status", label: "Current ART Status" },
          { key: "commenced_eac", label: "Commenced EAC" },
          { key: "completed_eac", label: "EAC Status" },
          { key: "caregiver", label: "Caregiver Name" },
          { key: "phone", label: "Caregiver Phone" }
        ];
      case "drug_pickup":
        return [
          ...baseCols,
          { key: "last_drug_pickup", label: "Last Drug Pickup" },
          { key: "caregiver", label: "Caregiver Name" },
          { key: "phone", label: "Caregiver Phone" }
        ];
      case "appointment":
        return [
          ...baseCols,
          { key: "next_appointment", label: "Next Appointment Date" },
          { key: "caregiver", label: "Caregiver Name" },
          { key: "phone", label: "Caregiver Phone" }
        ];
      case "iit":
        return [
          ...baseCols,
          { key: "last_drug_pickup", label: "Last Drug Pickup" },
          { key: "next_appointment", label: "Next Appointment" },
          { key: "art_status", label: "ART Status" },
          { key: "days_overdue", label: "Days Overdue", sortable: true },
          { key: "recommended_action", label: "Recommended Follow-up Action" },
          { key: "caregiver", label: "Caregiver Name" },
          { key: "phone", label: "Caregiver Phone" }
        ];
      case "nutrition":
      case "sam":
      case "mam":
        return [
          ...baseCols,
          { key: "weight", label: "Weight" },
          { key: "height", label: "Height" },
          { key: "bmi", label: "BMI" },
          { key: "nutrition", label: "Nutrition Status", sortable: true },
          { key: "serviceDate", label: "Latest Service Date", sortable: true },
          { key: "caregiver", label: "Caregiver Name" },
          { key: "phone", label: "Caregiver Phone" }
        ];
      case "tb":
      case "presumptive_tb":
        return [
          ...baseCols,
          { key: "tb_outcome", label: "TB Screening" },
          { key: "tb_referred", label: "Referred" },
          { key: "tb_detected", label: "TB Detected" },
          { key: "cad_score", label: "CAD Score" },
          { key: "cad_date", label: "CAD Date" },
          { key: "tpt_eligible", label: "TPT Eligible" },
          { key: "services", label: "Latest Services" },
          { key: "serviceDate", label: "Latest Service", sortable: true },
          { key: "caregiver", label: "Caregiver Name" },
          { key: "phone", label: "Caregiver Phone" }
        ];
      default:
        return [
          ...baseCols,
          { key: "serviceDate", label: "Latest Service", sortable: true }
        ];
    }
  }, [type]);

  // 3. Search, Sort, and Filter logic
  const filteredList = useMemo(() => {
    return beneficiaries.filter((b) => {
      const name = (b.ChildName || "").toLowerCase();
      const vcId = (b.VCUniqueID || "").toLowerCase();
      const ccw = (b.CCWName || "").toLowerCase();
      const cg = (b.CaregiverName || "").toLowerCase();
      const query = searchQuery.toLowerCase();

      // Search match
      const matchesSearch =
        name.includes(query) ||
        vcId.includes(query) ||
        ccw.includes(query) ||
        cg.includes(query);

      // Gender match
      const matchesGender = genderFilter === "All" || b.Sex === genderFilter;

      // LGA match
      const matchesLga = lgaFilter === "All" || b.LGA === lgaFilter;

      return matchesSearch && matchesGender && matchesLga;
    });
  }, [beneficiaries, searchQuery, genderFilter, lgaFilter]);

  // Sorting
  const sortedList = useMemo(() => {
    const list = [...filteredList];
    list.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      switch (sortField) {
        case "id":
          valA = a.VCUniqueID || "";
          valB = b.VCUniqueID || "";
          break;
        case "name":
          valA = a.ChildName || "";
          valB = b.ChildName || "";
          break;
        case "age":
          valA = a.Age || 0;
          valB = b.Age || 0;
          break;
        case "sex":
          valA = a.Sex || "";
          valB = b.Sex || "";
          break;
        case "lga":
          valA = a.LGA || "";
          valB = b.LGA || "";
          break;
        case "ccw":
          valA = a.CCWName || "";
          valB = b.CCWName || "";
          break;
        case "nutrition":
          valA = a.NutritionStatus || "";
          valB = b.NutritionStatus || "";
          break;
        case "days_overdue":
          valA = calculateDaysOverdue(a, targetDate);
          valB = calculateDaysOverdue(b, targetDate);
          break;
        case "serviceDate":
          valA = parseDate(a.DateOfLatestServiceProvided)?.getTime() || 0;
          valB = parseDate(b.DateOfLatestServiceProvided)?.getTime() || 0;
          break;
        default:
          valA = a.ChildName || "";
          valB = b.ChildName || "";
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredList, sortField, sortDirection, targetDate]);

  // Pagination
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedList.slice(start, start + pageSize);
  }, [sortedList, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedList.length / pageSize) || 1;

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  // 4. Resolve Value for specific cell
  const getCellValue = (b: Beneficiary, key: string) => {
    switch (key) {
      case "id":
        return b.VCUniqueID || "N/A";
      case "name":
        return b.ChildName || "Anonymous";
      case "age":
        return b.Age ?? "-";
      case "sex":
        return b.Sex || "-";
      case "community":
        return b.Community || "Unknown";
      case "lga":
        return b.LGA || "Unknown";
      case "ccw":
        return b.CCWName || "Unassigned";
      case "weight":
        return b.Weight !== null ? `${b.Weight} kg` : "-";
      case "height":
        return b.Height !== null ? `${b.Height} cm` : "-";
      case "bmi":
        return b.BMI !== null ? b.BMI.toFixed(1) : "-";
      case "nutrition":
        return b.NutritionStatus || "Not Assessed";
      case "services":
        return b.LatestServicesProvided || "-";
      case "serviceDate":
        return b.DateOfLatestServiceProvided || "-";
      case "caregiver":
        return b.CaregiverName || "-";
      case "phone":
        return b.CaregiverPhone || "-";
      case "art_status":
        return b.CurrentARTStatus || "-";
      case "vl_sample_date":
        return b.VLSampleCollectionDate || "Missing";
      case "vl_carried_out":
        return b.VLCarriedOut || "No";
      case "vl_result":
        return b.VLResult || "Missing";
      case "vl_date":
        return b.DateofVL || "Missing";
      case "commenced_eac":
        return b.CommencedonEAC || "No";
      case "completed_eac":
        return b.CompletedEAC || "No";
      case "last_drug_pickup":
        return b.LastDrugPickup || "Missing";
      case "next_appointment":
        return b.NextAppointmentDate || "Missing";
      case "days_overdue":
        return `${calculateDaysOverdue(b, targetDate)} Days`;
      case "recommended_action":
        return getIITFollowUpAction(b, calculateDaysOverdue(b, targetDate));
      case "tb_outcome":
        return b.TBScreeningOutcome || "Not Screened";
      case "tb_referred":
        return b.ReferredforTBDiagnosis || "No";
      case "tb_detected":
        return b.TBDetected || "No";
      case "cad_score":
        return b.CADScore ?? "-";
      case "cad_date":
        return b.CADScoreDate || "-";
      case "tpt_eligible":
        return b.EligibleforTBTPT || "No";
      default:
        return "-";
    }
  };

  // 5. Export functions
  const handleExportCSV = () => {
    const headers = columns.map((col) => col.label);
    const csvRows = sortedList.map((b) => {
      return columns.map((col) => {
        const val = getCellValue(b, col.key);
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(",");
    });

    const csvContent = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${title.replace(/\s+/g, "_")}.csv`);
    link.click();
  };

  const handleExportExcel = () => {
    const dataToExport = sortedList.map((b) => {
      const row: Record<string, any> = {};
      columns.forEach((col) => {
        row[col.label] = getCellValue(b, col.key);
      });
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Alert Details");

    if (dataToExport.length > 0) {
      const maxCols = Object.keys(dataToExport[0]).length;
      worksheet["!cols"] = Array(maxCols).fill({ wch: 20 });
    }

    XLSX.writeFile(workbook, `${title.replace(/\s+/g, "_")}.xlsx`);
  };

  const handleExportPDF = async () => {
    const element = document.getElementById("drilldown-table-capture");
    if (!element) return;

    let restoreStylesheets: (() => void) | null = null;
    try {
      restoreStylesheets = await prepareStylesheetsForHtml2Canvas();
    } catch (err) {
      console.error("Failed to temporarily sanitize stylesheets for html2canvas", err);
    }

    try {
      const canvas = await html2canvas(element, { scale: 1.5 });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("l", "mm", "a4");
      const imgWidth = 297;
      const pageHeight = 210;
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

      pdf.save(`${title.replace(/\s+/g, "_")}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Could not generate PDF. Please try printing directly or exporting to Excel/CSV.");
    } finally {
      if (restoreStylesheets) {
        restoreStylesheets();
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* 1. Modal overlay view */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
        <div className="bg-white w-full max-w-7xl rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
                {title}
              </h3>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Clinical Follow-up & Line List Drilldown • Showing {filteredList.length} of {beneficiaries.length} records
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Filters Bar */}
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-center gap-3 justify-between">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="relative w-full md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search name, VC ID, CCW, caregiver..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <select
                  value={genderFilter}
                  onChange={(e) => {
                    setGenderFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-300 rounded text-xs p-1.5 outline-none"
                >
                  <option value="All">All Genders</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              {uniqueLgas.length > 0 && (
                <div>
                  <select
                    value={lgaFilter}
                    onChange={(e) => {
                      setLgaFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-white border border-slate-300 rounded text-xs p-1.5 outline-none"
                  >
                    <option value="All">All LGAs</option>
                    {uniqueLgas.map((lg) => (
                      <option key={lg} value={lg}>
                        {lg}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded shadow-xs cursor-pointer transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel
              </button>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-3 py-1.5 rounded shadow-xs cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 rounded shadow-xs cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 bg-slate-900 hover:bg-black text-white font-bold text-xs px-3 py-1.5 rounded shadow-xs cursor-pointer transition-colors"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-400" />
                Print List
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto p-6" id="drilldown-table-container">
            <div id="drilldown-table-capture" className="bg-white p-2">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => col.sortable && toggleSort(col.key)}
                        className={`p-3 font-bold text-slate-700 select-none ${
                          col.sortable ? "cursor-pointer hover:bg-slate-200" : ""
                        }`}
                      >
                        {col.label}{" "}
                        {col.sortable && sortField === col.key && (sortDirection === "asc" ? "▲" : "▼")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedList.length > 0 ? (
                    paginatedList.map((b, idx) => (
                      <tr
                        key={idx}
                        className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                          idx % 2 === 1 ? "bg-slate-50/50" : ""
                        }`}
                      >
                        {columns.map((col) => {
                          const val = getCellValue(b, col.key);
                          const isId = col.key === "id";
                          const isName = col.key === "name";
                          const isAction = col.key === "recommended_action";
                          
                          return (
                            <td
                              key={col.key}
                              className={`p-3 ${isId ? "font-semibold text-slate-800 font-mono text-[11px]" : ""} ${
                                isName ? "font-bold text-slate-950" : "text-slate-600"
                              } ${isAction ? "font-semibold text-rose-700 bg-rose-50/40 rounded-sm" : ""}`}
                            >
                              {col.key === "nutrition" ? (
                                <span
                                  className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                                    String(val).toUpperCase().includes("SAM") ||
                                    String(val).toUpperCase().includes("SEVERE")
                                      ? "bg-rose-100 text-rose-800 border-rose-300"
                                      : String(val).toUpperCase().includes("MAM") ||
                                        String(val).toUpperCase().includes("MODERATE")
                                      ? "bg-orange-100 text-orange-800 border-orange-300"
                                      : String(val).toUpperCase().includes("MILD")
                                      ? "bg-amber-100 text-amber-800 border-amber-300"
                                      : String(val).toUpperCase().includes("NORMAL")
                                      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                      : "bg-slate-100 text-slate-600 border-slate-300"
                                  }`}
                                >
                                  {val}
                                </span>
                              ) : col.key === "tb_detected" ? (
                                String(val).toLowerCase() === "yes" ||
                                String(val).toLowerCase().includes("detected") ||
                                String(val).toLowerCase().includes("positive") ? (
                                  <span className="bg-rose-100 text-rose-800 border border-rose-300 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                    Detected
                                  </span>
                                ) : (
                                  val
                                )
                              ) : (
                                val
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={columns.length} className="p-6 text-center text-slate-400">
                        No matching clinical records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <span className="text-xs text-slate-500 font-semibold">
              Showing {filteredList.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, filteredList.length)} of {filteredList.length} beneficiaries
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className="p-1 border border-slate-300 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-7 h-7 text-xs font-bold rounded transition-colors ${
                    currentPage === p
                      ? "bg-blue-600 text-white"
                      : "border border-slate-300 hover:bg-slate-100 text-slate-600"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="p-1 border border-slate-300 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Hidden HTML print area container (Required for @media print rules) */}
      <div id="ccw-report-print-area" className="hidden print:block bg-white text-black p-8">
        <div className="border-b-2 border-black pb-4 mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight">CAPRS CLINICAL REPORT</h1>
          <p className="text-sm font-semibold uppercase mt-1">REPORT DATA: {title}</p>
          <p className="text-xs text-slate-600 mt-0.5">
            Generated on: {new Date().toLocaleDateString()} | Total Active Cohort: {beneficiaries.length} Records
          </p>
        </div>

        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-black font-bold uppercase text-slate-800">
              {columns.slice(0, 8).map((col) => (
                <th key={col.key} className="py-2 pr-2">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedList.map((b, idx) => (
              <tr key={idx} className="border-b border-slate-300">
                {columns.slice(0, 8).map((col) => (
                  <td key={col.key} className="py-2 pr-2">
                    {getCellValue(b, col.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
