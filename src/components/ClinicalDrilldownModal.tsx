/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { Search, X, Download, Printer, FileSpreadsheet, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { Beneficiary } from "../types";
import { parseDate } from "../utils/reportingEngine";

interface ClinicalDrilldownModalProps {
  isOpen: boolean;
  title: string;
  type: "nutrition" | "tb" | "general";
  beneficiaries: Beneficiary[];
  onClose: () => void;
}

export default function ClinicalDrilldownModal({
  isOpen,
  title,
  type,
  beneficiaries,
  onClose
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

  // 2. Search, Sort, and Filter logic
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
  }, [filteredList, sortField, sortDirection]);

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

  // 3. Export functions
  const handleExportCSV = () => {
    const headers =
      type === "nutrition"
        ? [
            "VC Unique ID",
            "Child Name",
            "Age",
            "Sex",
            "Community",
            "LGA",
            "CCW Name",
            "Weight",
            "Height",
            "BMI",
            "Nutrition Status",
            "Date of Latest Service Provided",
            "Caregiver Name",
            "Caregiver Phone"
          ]
        : [
            "VC Unique ID",
            "Child Name",
            "Age",
            "Sex",
            "Community",
            "Ward",
            "LGA",
            "CCW Name",
            "TB Screening Outcome",
            "Referred for TB Diagnosis",
            "TB Detected",
            "CAD Score",
            "CAD Score Date",
            "Eligible for TPT",
            "Latest Services Provided",
            "Date of Latest Service Provided",
            "Caregiver Name",
            "Caregiver Phone"
          ];

    const csvRows = sortedList.map((b) => {
      const fields =
        type === "nutrition"
          ? [
              b.VCUniqueID,
              b.ChildName,
              b.Age,
              b.Sex,
              b.Community,
              b.LGA,
              b.CCWName,
              b.Weight,
              b.Height,
              b.BMI,
              b.NutritionStatus,
              b.DateOfLatestServiceProvided,
              b.CaregiverName,
              b.CaregiverPhone
            ]
          : [
              b.VCUniqueID,
              b.ChildName,
              b.Age,
              b.Sex,
              b.Community,
              b.Ward,
              b.LGA,
              b.CCWName,
              b.TBScreeningOutcome,
              b.ReferredforTBDiagnosis,
              b.TBDetected,
              b.CADScore,
              b.CADScoreDate,
              b.EligibleforTBTPT,
              b.LatestServicesProvided,
              b.DateOfLatestServiceProvided,
              b.CaregiverName,
              b.CaregiverPhone
            ];

      return fields.map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(",");
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
      if (type === "nutrition") {
        return {
          "VC Unique ID": b.VCUniqueID || "",
          "Child Name": b.ChildName || "",
          "Age": b.Age || 0,
          "Sex": b.Sex || "",
          "Community": b.Community || "",
          "LGA": b.LGA || "",
          "CCW Name": b.CCWName || "",
          "Weight (kg)": b.Weight || "",
          "Height (cm)": b.Height || "",
          "BMI": b.BMI || "",
          "Nutrition Status": b.NutritionStatus || "",
          "Date of Latest Service": b.DateOfLatestServiceProvided || "",
          "Caregiver Name": b.CaregiverName || "",
          "Caregiver Phone": b.CaregiverPhone || ""
        };
      } else {
        return {
          "VC Unique ID": b.VCUniqueID || "",
          "Child Name": b.ChildName || "",
          "Age": b.Age || 0,
          "Sex": b.Sex || "",
          "Community": b.Community || "",
          "Ward": b.Ward || "",
          "LGA": b.LGA || "",
          "CCW Name": b.CCWName || "",
          "TB Screening Outcome": b.TBScreeningOutcome || "",
          "Referred for TB Diagnosis": b.ReferredforTBDiagnosis || "",
          "TB Detected": b.TBDetected || "",
          "CAD Score": b.CADScore || "",
          "CAD Score Date": b.CADScoreDate || "",
          "Eligible for TPT": b.EligibleforTBTPT || "",
          "Latest Services Provided": b.LatestServicesProvided || "",
          "Date of Latest Service": b.DateOfLatestServiceProvided || "",
          "Caregiver Name": b.CaregiverName || "",
          "Caregiver Phone": b.CaregiverPhone || ""
        };
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Beneficiaries");

    if (dataToExport.length > 0) {
      const maxCols = Object.keys(dataToExport[0]).length;
      worksheet["!cols"] = Array(maxCols).fill({ wch: 18 });
    }

    XLSX.writeFile(workbook, `${title.replace(/\s+/g, "_")}.xlsx`);
  };

  const handleExportPDF = async () => {
    const element = document.getElementById("drilldown-table-capture");
    if (!element) return;
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
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* 1. Modal overlay view */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
        <div className="bg-white w-full max-w-6xl rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
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
                    <th
                      onClick={() => toggleSort("id")}
                      className="p-3 font-bold text-slate-700 cursor-pointer hover:bg-slate-200 select-none"
                    >
                      VC Unique ID {sortField === "id" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
                    <th
                      onClick={() => toggleSort("name")}
                      className="p-3 font-bold text-slate-700 cursor-pointer hover:bg-slate-200 select-none"
                    >
                      Child Name {sortField === "name" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
                    <th
                      onClick={() => toggleSort("age")}
                      className="p-3 font-bold text-slate-700 cursor-pointer hover:bg-slate-200 select-none"
                    >
                      Age {sortField === "age" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
                    <th
                      onClick={() => toggleSort("sex")}
                      className="p-3 font-bold text-slate-700 cursor-pointer hover:bg-slate-200 select-none"
                    >
                      Sex {sortField === "sex" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
                    <th className="p-3 font-bold text-slate-700">Community</th>
                    {type === "tb" && <th className="p-3 font-bold text-slate-700">Ward</th>}
                    <th
                      onClick={() => toggleSort("lga")}
                      className="p-3 font-bold text-slate-700 cursor-pointer hover:bg-slate-200 select-none"
                    >
                      LGA {sortField === "lga" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
                    <th
                      onClick={() => toggleSort("ccw")}
                      className="p-3 font-bold text-slate-700 cursor-pointer hover:bg-slate-200 select-none"
                    >
                      CCW Name {sortField === "ccw" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>

                    {type === "nutrition" ? (
                      <>
                        <th className="p-3 font-bold text-slate-700">Weight (kg)</th>
                        <th className="p-3 font-bold text-slate-700">Height (cm)</th>
                        <th className="p-3 font-bold text-slate-700">BMI</th>
                        <th
                          onClick={() => toggleSort("nutrition")}
                          className="p-3 font-bold text-slate-700 cursor-pointer hover:bg-slate-200 select-none"
                        >
                          Nutrition Status {sortField === "nutrition" && (sortDirection === "asc" ? "▲" : "▼")}
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="p-3 font-bold text-slate-700 text-[10px]">TB Screening</th>
                        <th className="p-3 font-bold text-slate-700 text-[10px]">Referred</th>
                        <th className="p-3 font-bold text-slate-700 text-[10px]">TB Detected</th>
                        <th className="p-3 font-bold text-slate-700 text-[10px]">CAD Score</th>
                        <th className="p-3 font-bold text-slate-700 text-[10px]">CAD Date</th>
                        <th className="p-3 font-bold text-slate-700 text-[10px]">TPT Eligible</th>
                      </>
                    )}

                    <th
                      onClick={() => toggleSort("serviceDate")}
                      className="p-3 font-bold text-slate-700 cursor-pointer hover:bg-slate-200 select-none text-right"
                    >
                      Latest Service {sortField === "serviceDate" && (sortDirection === "asc" ? "▲" : "▼")}
                    </th>
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
                        <td className="p-3 font-semibold text-slate-800 font-mono text-[11px]">
                          {b.VCUniqueID || "N/A"}
                        </td>
                        <td className="p-3 font-bold text-slate-950">{b.ChildName || "Anonymous"}</td>
                        <td className="p-3 font-medium text-slate-600">{b.Age}</td>
                        <td className="p-3 font-medium text-slate-600">{b.Sex}</td>
                        <td className="p-3 text-slate-600 truncate max-w-[120px]">{b.Community || "Unknown"}</td>
                        {type === "tb" && <td className="p-3 text-slate-600">{b.Ward || "Unknown"}</td>}
                        <td className="p-3 text-slate-600 font-semibold">{b.LGA || "Unknown"}</td>
                        <td className="p-3 text-slate-600 truncate max-w-[120px]">{b.CCWName || "Unassigned"}</td>

                        {type === "nutrition" ? (
                          <>
                            <td className="p-3 font-medium text-slate-800 font-mono">{b.Weight || "-"}</td>
                            <td className="p-3 font-medium text-slate-800 font-mono">{b.Height || "-"}</td>
                            <td className="p-3 font-bold text-slate-800 font-mono">{b.BMI || "-"}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                                  (b.NutritionStatus || "").toUpperCase().includes("SAM") ||
                                  (b.NutritionStatus || "").toUpperCase().includes("SEVERE")
                                    ? "bg-rose-100 text-rose-800 border-rose-300"
                                    : (b.NutritionStatus || "").toUpperCase().includes("MAM") ||
                                      (b.NutritionStatus || "").toUpperCase().includes("MODERATE")
                                    ? "bg-orange-100 text-orange-800 border-orange-300"
                                    : (b.NutritionStatus || "").toUpperCase().includes("MILD")
                                    ? "bg-amber-100 text-amber-800 border-amber-300"
                                    : (b.NutritionStatus || "").toUpperCase().includes("NORMAL")
                                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                    : "bg-slate-100 text-slate-600 border-slate-300"
                                }`}
                              >
                                {b.NutritionStatus || "Not Assessed"}
                              </span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 font-medium text-slate-600 text-[11px]">
                              {b.TBScreeningOutcome || "Not Screened"}
                            </td>
                            <td className="p-3 font-semibold text-slate-600">{b.ReferredforTBDiagnosis || "No"}</td>
                            <td className="p-3">
                              {b.TBDetected &&
                              (b.TBDetected.toLowerCase() === "yes" ||
                                b.TBDetected.toLowerCase().includes("detected") ||
                                b.TBDetected.toLowerCase().includes("positive")) ? (
                                <span className="bg-rose-100 text-rose-800 border border-rose-300 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                  Detected
                                </span>
                              ) : (
                                <span className="text-slate-500">{b.TBDetected || "No"}</span>
                              )}
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-700">{b.CADScore ?? "-"}</td>
                            <td className="p-3 font-mono text-slate-500 text-[10px]">
                              {b.CADScoreDate || "-"}
                            </td>
                            <td className="p-3 font-semibold text-slate-600">{b.EligibleforTBTPT || "No"}</td>
                          </>
                        )}

                        <td className="p-3 font-mono text-slate-600 text-right text-[11px] font-semibold">
                          {b.DateOfLatestServiceProvided || "-"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={type === "nutrition" ? 12 : 15} className="p-6 text-center text-slate-400">
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

      {/* 2. Hidden HTML print area container (Required for @media print rules in index.css) */}
      <div id="ccw-report-print-area" className="hidden print:block bg-white text-black p-8">
        <div className="border-b-2 border-black pb-4 mb-6">
          <h1 className="text-2xl font-bold uppercase tracking-tight">CAPRS CLINICAL REPORT</h1>
          <p className="text-sm font-semibold uppercase mt-1">REPORT DATA: {title}</p>
          <p className="text-xs text-slate-600 mt-0.5">
            Generated on: {new Date().toLocaleDateString()} | Total Deployed Cohort: {beneficiaries.length} Records
          </p>
        </div>

        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-black font-bold uppercase text-slate-800">
              <th className="py-2 pr-2">VC Unique ID</th>
              <th className="py-2 pr-2">Child Name</th>
              <th className="py-2 pr-2">Age</th>
              <th className="py-2 pr-2">Sex</th>
              <th className="py-2 pr-2">Community</th>
              <th className="py-2 pr-2">LGA</th>
              <th className="py-2 pr-2">CCW</th>
              {type === "nutrition" ? (
                <>
                  <th className="py-2 pr-2">Weight</th>
                  <th className="py-2 pr-2">Height</th>
                  <th className="py-2 pr-2">BMI</th>
                  <th className="py-2 pr-2">Nutrition Status</th>
                </>
              ) : (
                <>
                  <th className="py-2 pr-2">Screening</th>
                  <th className="py-2 pr-2">TB Detected</th>
                  <th className="py-2 pr-2">CAD Score</th>
                </>
              )}
              <th className="py-2 text-right">Latest Service Date</th>
            </tr>
          </thead>
          <tbody>
            {sortedList.map((b, idx) => (
              <tr key={idx} className="border-b border-slate-300">
                <td className="py-2 pr-2 font-mono font-bold">{b.VCUniqueID}</td>
                <td className="py-2 pr-2 font-bold">{b.ChildName}</td>
                <td className="py-2 pr-2">{b.Age}</td>
                <td className="py-2 pr-2">{b.Sex}</td>
                <td className="py-2 pr-2 truncate max-w-[100px]">{b.Community}</td>
                <td className="py-2 pr-2 font-semibold">{b.LGA}</td>
                <td className="py-2 pr-2 truncate max-w-[100px]">{b.CCWName}</td>
                {type === "nutrition" ? (
                  <>
                    <td className="py-2 pr-2 font-mono">{b.Weight || "-"}</td>
                    <td className="py-2 pr-2 font-mono">{b.Height || "-"}</td>
                    <td className="py-2 pr-2 font-mono font-bold">{b.BMI || "-"}</td>
                    <td className="py-2 pr-2 font-bold uppercase">{b.NutritionStatus || "Not Assessed"}</td>
                  </>
                ) : (
                  <>
                    <td className="py-2 pr-2 text-[10px]">{b.TBScreeningOutcome || "Not Screened"}</td>
                    <td className="py-2 pr-2 font-bold">{b.TBDetected || "No"}</td>
                    <td className="py-2 pr-2 font-mono">{b.CADScore ?? "-"}</td>
                  </>
                )}
                <td className="py-2 text-right font-mono">{b.DateOfLatestServiceProvided}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
