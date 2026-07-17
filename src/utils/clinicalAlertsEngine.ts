/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Beneficiary, ReportFilters } from "../types";
import { parseDate, isDateInReportingPeriod } from "./reportingEngine";
import { getNutritionCategory } from "../components/NutritionDashboard";
import { isPresumptive } from "../components/TuberculosisDashboard";

export interface AlertDetail {
  id: string;
  name: string;
  count: number;
  percentage: number;
  status: "critical" | "warning" | "complete";
  severity: "🔴" | "🟠" | "🟢";
  list: Beneficiary[];
}

export interface ClinicalAlertsSummary {
  noBmi: AlertDetail;
  missingVlSampleDate: AlertDetail;
  missingVlResult: AlertDetail;
  missingDateOfVl: AlertDetail;
  unsuppressed: AlertDetail;
  missingDrugPickup: AlertDetail;
  missingNextAppointment: AlertDetail;
  iit: AlertDetail;
  sam: AlertDetail;
  mam: AlertDetail;
  presumptiveTb: AlertDetail;
}

// 1. Days overdue calculation for appointments
export function calculateDaysOverdue(b: Beneficiary, targetDate: Date): number {
  if (!b.NextAppointmentDate) return 0;
  const nextAppt = parseDate(b.NextAppointmentDate);
  if (!nextAppt) return 0;
  const diffTime = targetDate.getTime() - nextAppt.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

// 2. Recommend follow-up action for IIT
export function getIITFollowUpAction(b: Beneficiary, daysOverdue: number): string {
  const phone = b.CaregiverPhone ? `at ${b.CaregiverPhone}` : "";
  if (daysOverdue >= 28) {
    return `Critical: CCW Home Visit required immediately. Mobilize ${b.CCWName || "assigned CCW"} to trace caregiver ${b.CaregiverName || ""} ${phone} at ${b.Community || b.Address || "their community"}.`;
  }
  if (daysOverdue >= 14) {
    return `Warning: Schedule phone tracing call to caregiver ${b.CaregiverName || ""} ${phone}. Prepare home visit if unreachable.`;
  }
  if (daysOverdue > 0) {
    return `Informational: Send appointment reminder SMS or place a quick phone call to caregiver ${b.CaregiverName || ""} ${phone} to reschedule.`;
  }
  const art = String(b.CurrentARTStatus || "").toLowerCase();
  if (art.includes("iit") || art.includes("lost") || art.includes("default")) {
    return `Critical ART Status: Active clinical tracking initiated. Mobilize CCW tracking team immediately.`;
  }
  return `Routine: Verify latest ART clinical record with facility.`;
}

// 3. Robust IIT checker
export function isIITBeneficiary(b: Beneficiary, thresholdDays: number, targetDate: Date): boolean {
  if (b.OVCStatus !== "Active") return false;

  // Rule A: Current ART Status indicating IIT, LTFU, etc.
  const art = String(b.CurrentARTStatus || "").toLowerCase().trim();
  if (
    art.includes("iit") ||
    art.includes("lost") ||
    art.includes("interruption") ||
    art.includes("default") ||
    art.includes("ltfu") ||
    art.includes("missed")
  ) {
    return true;
  }

  // Rule B: Next Appointment Date overdue by thresholdDays
  const daysOverdue = calculateDaysOverdue(b, targetDate);
  if (daysOverdue >= thresholdDays) {
    return true;
  }

  // Rule C: OVC Status itself explicitly flagged
  const ovc = String(b.OVCStatus || "").toLowerCase().trim();
  if (ovc.includes("iit") || ovc.includes("lost")) {
    return true;
  }

  return false;
}

// 4. Robust Unsuppressed checker
export function isUnsuppressedBeneficiary(b: Beneficiary): boolean {
  if (b.OVCStatus !== "Active") return false;

  const suppression = String(b.VLSuppressionStatus || "").toLowerCase().trim();
  if (suppression.includes("unsuppressed") || suppression === "unsuppressed") {
    return true;
  }

  // Fallback to result numeric value if present
  const resultStr = String(b.VLResult || "").trim();
  if (resultStr) {
    const numericOnly = resultStr.replace(/[,<>\s]/g, "");
    const val = Number(numericOnly);
    if (!isNaN(val) && val >= 1000) {
      return true;
    }
  }

  return false;
}

// 5. Single Calculation Engine for Clinical Alerts
export function calculateClinicalAlerts(
  beneficiaries: Beneficiary[],
  filters: ReportFilters,
  targetDate: Date,
  iitThresholdDays: number
): {
  summary: ClinicalAlertsSummary;
  unsuppressedCharts: {
    lga: { name: string; value: number }[];
    community: { name: string; value: number }[];
    ccw: { name: string; value: number }[];
    trend: { month: string; value: number; rawDate: Date }[];
  };
  iitCharts: {
    lga: { name: string; value: number }[];
    community: { name: string; value: number }[];
    ccw: { name: string; value: number }[];
    trend: { month: string; value: number; rawDate: Date }[];
  };
} {
  // Pre-filter beneficiaries for the current active global filters
  const activeBeneficiaries = beneficiaries.filter((b) => b.OVCStatus === "Active");
  const activeCount = activeBeneficiaries.length || 1;

  // List 1: Beneficiaries Served but No BMI
  const noBmiList = activeBeneficiaries.filter((b) => {
    // Falls within reporting period
    const serviceDate = parseDate(b.DateOfLatestServiceProvided);
    if (!serviceDate) return false;
    const inPeriod = isDateInReportingPeriod(
      serviceDate,
      filters.ReportingPeriod,
      filters.StartDate,
      filters.EndDate,
      targetDate
    );
    if (!inPeriod) return false;

    // BMI is blank, null, or invalid
    const bmiVal = Number(b.BMI);
    return b.BMI === null || b.BMI === undefined || isNaN(bmiVal) || bmiVal <= 0 || String(b.BMI).trim() === "";
  });

  // List 2: Missing Viral Load Sample Date (Eligible Active beneficiaries, collection date is blank)
  const missingVlSampleDateList = activeBeneficiaries.filter((b) => {
    // Eligible for VL: CALHIV stream or HIV status Positive
    const isEligible =
      b.EnrolmentStream === "CALHIV" ||
      String(b.CurrentHIVStatus || "").toLowerCase().includes("pos") ||
      String(b.CurrentHIVStatus || "").toLowerCase() === "positive";
    
    if (!isEligible) return false;

    return !b.VLSampleCollectionDate || String(b.VLSampleCollectionDate).trim() === "";
  });

  // List 3: Missing VL Result (VL Carried Out = Yes, VL Result is blank)
  const missingVlResultList = activeBeneficiaries.filter((b) => {
    const carriedOut = String(b.VLCarriedOut || "").toLowerCase().trim() === "yes";
    return carriedOut && (!b.VLResult || String(b.VLResult).trim() === "");
  });

  // List 4: Missing Date of VL (VL Carried Out = Yes, Date of VL is blank)
  const missingDateOfVlList = activeBeneficiaries.filter((b) => {
    const carriedOut = String(b.VLCarriedOut || "").toLowerCase().trim() === "yes";
    return carriedOut && (!b.DateofVL || String(b.DateofVL).trim() === "");
  });

  // List 5: Unsuppressed Beneficiaries
  const unsuppressedList = activeBeneficiaries.filter(isUnsuppressedBeneficiary);

  // List 6: Missing Last Drug Pickup Date
  const missingDrugPickupList = activeBeneficiaries.filter((b) => {
    const needsDrugs =
      b.EnrolmentStream === "CALHIV" ||
      b.EnrolmentStream === "HEI" ||
      String(b.CurrentHIVStatus || "").toLowerCase().includes("pos") ||
      String(b.CurrentARTStatus || "").trim() !== "";
    
    return needsDrugs && (!b.LastDrugPickup || String(b.LastDrugPickup).trim() === "");
  });

  // List 7: Missing Next Appointment Date
  const missingNextAppointmentList = activeBeneficiaries.filter((b) => {
    const needsAppt =
      b.EnrolmentStream === "CALHIV" ||
      b.EnrolmentStream === "HEI" ||
      String(b.CurrentHIVStatus || "").toLowerCase().includes("pos") ||
      String(b.CurrentARTStatus || "").trim() !== "";

    return needsAppt && (!b.NextAppointmentDate || String(b.NextAppointmentDate).trim() === "");
  });

  // List 8: Interrupted in Treatment (IIT)
  const iitList = activeBeneficiaries.filter((b) => isIITBeneficiary(b, iitThresholdDays, targetDate));

  // List 9: Severe Acute Malnutrition (SAM)
  const samList = activeBeneficiaries.filter((b) => getNutritionCategory(b) === "SAM");

  // List 10: Moderate Acute Malnutrition (MAM)
  const mamList = activeBeneficiaries.filter((b) => getNutritionCategory(b) === "MAM");

  // List 11: Presumptive TB
  const presumptiveTbList = activeBeneficiaries.filter(isPresumptive);

  // Helper to construct AlertDetail object
  const createDetail = (
    id: string,
    name: string,
    list: Beneficiary[],
    defaultSeverity: "🔴" | "🟠"
  ): AlertDetail => {
    const count = list.length;
    const percentage = parseFloat(((count / activeCount) * 100).toFixed(1));
    const status = count === 0 ? "complete" : (defaultSeverity === "🔴" ? "critical" : "warning");
    const severity = count === 0 ? "🟢" : defaultSeverity;

    return { id, name, count, percentage, status, severity, list };
  };

  const summary: ClinicalAlertsSummary = {
    noBmi: createDetail("noBmi", "Beneficiaries Served but No BMI", noBmiList, "🔴"),
    missingVlSampleDate: createDetail("missingVlSampleDate", "Missing VL Sample Date", missingVlSampleDateList, "🔴"),
    missingVlResult: createDetail("missingVlResult", "Missing Viral Load Result", missingVlResultList, "🔴"),
    missingDateOfVl: createDetail("missingDateOfVl", "Missing Date of VL", missingDateOfVlList, "🔴"),
    unsuppressed: createDetail("unsuppressed", "Unsuppressed Beneficiaries", unsuppressedList, "🔴"),
    missingDrugPickup: createDetail("missingDrugPickup", "Missing Last Drug Pickup Date", missingDrugPickupList, "🟠"),
    missingNextAppointment: createDetail("missingNextAppointment", "Missing Next Appointment Date", missingNextAppointmentList, "🟠"),
    iit: createDetail("iit", "Interrupted in Treatment (IIT)", iitList, "🔴"),
    sam: createDetail("sam", "Severe Acute Malnutrition (SAM)", samList, "🟠"),
    mam: createDetail("mam", "Moderate Acute Malnutrition (MAM)", mamList, "🟠"),
    presumptiveTb: createDetail("presumptiveTb", "Presumptive TB", presumptiveTbList, "🔴")
  };

  // --- CHART GENERATION LOGIC ---

  // Aggregate by location & CCW helpers
  const aggregateBy = (list: Beneficiary[], keyGetter: (b: Beneficiary) => string) => {
    const map = new Map<string, number>();
    list.forEach((b) => {
      const key = keyGetter(b) || "Unknown";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  };

  // Aggregate monthly trend
  const aggregateTrend = (list: Beneficiary[]) => {
    const map = new Map<string, { month: string; rawDate: Date; value: number }>();
    list.forEach((b) => {
      const date = parseDate(b.DateOfLatestServiceProvided) || parseDate(b.DateOfEnrolment);
      if (!date) return;
      const mStr = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);

      if (!map.has(mStr)) {
        map.set(mStr, { month: mStr, rawDate: startOfMonth, value: 0 });
      }
      map.get(mStr)!.value++;
    });

    return Array.from(map.values())
      .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime())
      .map((item) => ({ month: item.month, value: item.value, rawDate: item.rawDate }));
  };

  return {
    summary,
    unsuppressedCharts: {
      lga: aggregateBy(unsuppressedList, (b) => b.LGA).slice(0, 10),
      community: aggregateBy(unsuppressedList, (b) => b.Community).slice(0, 10),
      ccw: aggregateBy(unsuppressedList, (b) => b.CCWName).slice(0, 10),
      trend: aggregateTrend(unsuppressedList)
    },
    iitCharts: {
      lga: aggregateBy(iitList, (b) => b.LGA).slice(0, 10),
      community: aggregateBy(iitList, (b) => b.Community).slice(0, 10),
      ccw: aggregateBy(iitList, (b) => b.CCWName).slice(0, 10),
      trend: aggregateTrend(iitList)
    }
  };
}
