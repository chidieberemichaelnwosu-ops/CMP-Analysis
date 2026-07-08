/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, Database } from "lucide-react";

interface ImportModuleProps {
  onDataLoaded: (rawRows: any[], fileName: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function ImportModule({ onDataLoaded, isLoading, setIsLoading }: ImportModuleProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    setIsLoading(true);
    setError("");
    setSuccess(false);
    setUploadProgress("Reading uploaded file bytes...");

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) throw new Error("Could not read file content.");

        setUploadProgress("Decompressing binary sheets...");
        const workbook = XLSX.read(data, { type: "array" });
        
        const firstSheetName = workbook.SheetNames[0];
        setUploadProgress(`Loading sheet "${firstSheetName}"...`);
        const worksheet = workbook.Sheets[firstSheetName];
        
        setUploadProgress("Parsing table rows into JSON memory...");
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!jsonRows || jsonRows.length === 0) {
          throw new Error("The selected worksheet appears to be empty.");
        }

        setUploadProgress(`Loaded ${jsonRows.length.toLocaleString()} raw rows. Normalizing columns...`);
        onDataLoaded(jsonRows, file.name);
        setSuccess(true);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "An error occurred while parsing the file. Please ensure it is a valid spreadsheet.");
      } finally {
        setIsLoading(false);
        setUploadProgress("");
      }
    };

    reader.onerror = () => {
      setError("File reading failed due to disk or browser permissions.");
      setIsLoading(false);
      setUploadProgress("");
    };

    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-xl mx-auto p-5 bg-white border border-slate-300 rounded shadow-xs" id="import-module">
      <div className="text-center mb-5">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded bg-blue-50 text-blue-600 mb-2 border border-blue-200">
          <Database className="w-5 h-5" />
        </div>
        <h2 className="text-base font-bold text-slate-800 uppercase tracking-tight">CMP Line List Importer</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          Upload a standard Child Monitor Plus (CMP) Line List spreadsheet. Supports <code className="font-mono bg-slate-50 px-1 text-blue-600">.xlsx</code>, <code className="font-mono bg-slate-50 px-1 text-blue-600">.xls</code>, and <code className="font-mono bg-slate-50 px-1 text-blue-600">.csv</code>.
        </p>
      </div>

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        className={`relative group flex flex-col items-center justify-center w-full min-h-[180px] p-4 border-2 border-dashed rounded cursor-pointer transition-all ${
          dragActive
            ? "border-blue-500 bg-blue-50/40"
            : "border-slate-300 hover:border-blue-500 hover:bg-slate-50/50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".xlsx, .xls, .csv"
          onChange={handleChange}
          disabled={isLoading}
        />

        {isLoading ? (
          <div className="flex flex-col items-center text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-xs font-semibold text-slate-700">{uploadProgress}</p>
            <p className="text-[10px] text-slate-400 mt-1">Please keep this tab open. Ingestion in progress...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="w-10 h-10 bg-slate-100 group-hover:bg-blue-50 text-slate-500 group-hover:text-blue-600 rounded flex items-center justify-center transition-colors mb-3">
              <Upload className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-700">
              Drag and drop your spreadsheet here, or <span className="text-blue-600 underline">browse</span>
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Maximum recommended size: 100,000 rows (Approx. 20MB)</p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded mt-3 animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-[11px] font-bold text-red-800 uppercase">Processing Error</h4>
            <p className="text-[11px] text-red-600 mt-0.5 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded mt-3 animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-[11px] font-bold text-emerald-800 uppercase">File Ingestion Complete</h4>
            <p className="text-[11px] text-emerald-600 mt-0.5 leading-relaxed">
              Line list has been parsed, normalized, and cached in-memory. Database is ready for dashboard generation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
