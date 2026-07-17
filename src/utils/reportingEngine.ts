/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Beneficiary,
  CCWCounter,
  AggregationNode,
  ReportingPeriod,
  ReportFilters,
  DQIssue,
  DataQualitySummary,
  ValidationResult
} from "../types";

// Helper to convert Excel serial numbers to JS Date objects
export function excelSerialToDate(serial: number): Date {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  
  const fractional_day = serial - Math.floor(serial) + 0.0000001;
  let total_seconds = Math.floor(86400 * fractional_day);
  
  const seconds = total_seconds % 60;
  total_seconds = Math.floor(total_seconds / 60);
  const minutes = total_seconds % 60;
  const hours = Math.floor(total_seconds / 60);
  
  return new Date(
    date_info.getFullYear(),
    date_info.getMonth(),
    date_info.getDate(),
    hours,
    minutes,
    seconds
  );
}

// Robust date parser
export function parseDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    try {
      return excelSerialToDate(val);
    } catch {
      return null;
    }
  }
  const s = String(val).trim();
  if (!s) return null;

  // Try standard YYYY-MM-DD
  const parts1 = s.split("-");
  if (parts1.length === 3) {
    const year = Number(parts1[0]);
    const month = Number(parts1[1]) - 1;
    const day = Number(parts1[2]);
    if (year >= 1900 && month >= 0 && month < 12 && day > 0 && day <= 31) {
      return new Date(year, month, day);
    }
  }

  // Try MM/DD/YYYY or DD/MM/YYYY
  const parts2 = s.split("/");
  if (parts2.length === 3) {
    const p1 = Number(parts2[0]);
    const p2 = Number(parts2[1]);
    const p3 = Number(parts2[2]);
    const year = p3 < 100 ? (p3 > 50 ? 1900 + p3 : 2000 + p3) : p3;
    
    if (p1 > 12) {
      // Must be DD/MM/YYYY
      return new Date(year, p2 - 1, p1);
    } else {
      // Try MM/DD/YYYY
      return new Date(year, p1 - 1, p2);
    }
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  return null;
}

// Normalizes a raw object from excel/csv to a structured Beneficiary record
export function normalizeBeneficiary(raw: any, index: number): Beneficiary {
  // Normalize the keys of the raw object to prevent casing and whitespace issues
  const normalizedRaw: Record<string, any> = {};
  if (raw && typeof raw === "object") {
    Object.keys(raw).forEach((key) => {
      const normalizedKey = key.toLowerCase().replace(/[\s_\-\/]+/g, "");
      normalizedRaw[normalizedKey] = raw[key];
    });
  }

  const getStr = (keys: string[]): string => {
    for (const key of keys) {
      const normKey = key.toLowerCase().replace(/[\s_\-\/]+/g, "");
      if (normalizedRaw[normKey] !== undefined && normalizedRaw[normKey] !== null) {
        return String(normalizedRaw[normKey]).trim();
      }
    }
    return "";
  };

  const getNum = (keys: string[], defaultVal: number | null = null): number | null => {
    for (const key of keys) {
      const normKey = key.toLowerCase().replace(/[\s_\-\/]+/g, "");
      if (normalizedRaw[normKey] !== undefined && normalizedRaw[normKey] !== null) {
        const n = Number(normalizedRaw[normKey]);
        if (!isNaN(n)) return n;
      }
    }
    return defaultVal;
  };

  // Maps excel columns with flexible header detection
  const stateVal = getStr(["State", "STATE", "state"]);
  const lgaVal = getStr(["LGA", "Lga", "lga", "Local Government Area", "LocalGovernmentArea"]);
  const wardVal = getStr(["Ward", "WARD", "ward"]);
  const commVal = getStr(["Community", "COMMUNITY", "community"]);
  const addressVal = getStr(["Address", "ADDRESS", "address"]);
  const enrolDateVal = getStr(["Date of Enrolment", "Date of Enrollment", "Enrolment Date", "Enrollment Date", "DateOfEnrolment", "DateOfEnrollment"]);
  const vcIdVal = getStr(["VC Unique ID", "VCUniqueID", "vc_unique_id", "Beneficiary ID", "Child ID", "id", "VC ID", "VCID"]);
  const nameVal = getStr(["Child Name", "ChildName", "child_name", "Beneficiary Name", "Name"]);
  const sexVal = getStr(["Sex", "SEX", "Gender", "gender", "sex"]);
  const dobVal = getStr(["Date of Birth", "DateofBirth", "DOB", "dob"]);
  const ageVal = getNum(["Age", "AGE", "age"]) || 0;
  const ageUnitVal = getStr(["Age Unit", "AgeUnit", "age_unit"]) || "Years";
  
  // Normalizing enrolment stream (CALHIV vs HEI)
  const rawStream = getStr(["Enrolment Stream", "Enrollment Stream", "Stream", "Cohort Stream", "Cohort"]);
  let streamVal = rawStream;
  if (rawStream) {
    const streamLower = rawStream.toLowerCase().trim();
    if (
      streamLower.includes("calhiv") ||
      streamLower.includes("clhiv") ||
      streamLower.includes("child living with hiv") ||
      streamLower.includes("children living with hiv") ||
      streamLower.includes("living with hiv")
    ) {
      streamVal = "CALHIV";
    } else if (
      streamLower.includes("hei") ||
      streamLower.includes("exposed infant") ||
      streamLower.includes("exposed infants") ||
      streamLower.includes("hiv exposed")
    ) {
      streamVal = "HEI";
    } else {
      streamVal = rawStream.toUpperCase();
    }
  }

  // Normalizing OVC Status
  const rawStatus = getStr(["OVC Status", "OVCStatus", "Status", "status", "Ovc Status"]);
  let statusVal = "Inactive";
  if (rawStatus) {
    const statusLower = rawStatus.toLowerCase();
    if (statusLower === "active") statusVal = "Active";
    else if (statusLower === "inactive") statusVal = "Inactive";
    else if (statusLower === "migrated") statusVal = "Migrated";
    else if (statusLower === "exited") statusVal = "Exited";
    else if (statusLower === "transferred out" || statusLower === "transferredout" || statusLower.includes("transfer")) statusVal = "Transferred Out";
    else if (statusLower === "deceased" || statusLower === "dead") statusVal = "Deceased";
    else {
      // Capitalize first letter as fallback
      statusVal = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
    }
  }

  const pregVal = getStr(["Pregnancy Status", "PregnancyStatus"]);
  const dateHivVal = getStr(["Date of Current HIV Status", "DateOfCurrentHIVStatus", "Date of HIV Status"]);
  const hivStatusVal = getStr(["Current HIV Status", "HIV Status", "CurrentHIVStatus"]);
  const artStartVal = getStr(["ART Start Date", "ARTStartDate"]);
  const facilityVal = getStr(["Current ART Facility", "CurrentARTFacility", "ART Facility"]);
  const heiArtVal = getStr(["HEI/ART UID", "HEI ART UID", "HEI_ART_UID", "HEI ART ID"]);
  const regimenTypeVal = getStr(["Regimen Type", "RegimenType"]);
  const currentRegimenVal = getStr(["Current Regimen", "CurrentRegimen"]);
  const numArvVal = getStr(["Number of ARV", "NumberofARVs", "Number of ARVs", "ARV Count"]);
  const lastPickupVal = getStr(["Last Drug Pickup", "LastDrugPickup", "Drug Pickup Date"]);
  const nextApptVal = getStr(["Next Appointment Date", "NextAppointmentDate", "Next Appointment"]);
  const vlCarriedVal = getStr(["VL Carried Out", "VLCarriedOut", "Viral Load Carried Out"]);
  const dateVlVal = getStr(["Date of VL", "DateofVL", "VL Date"]);
  const vlSampleVal = getStr(["VL Sample Collection Date", "VLSampleCollectionDate"]);
  const vlResultVal = getStr(["VL Result", "VLResult"]);
  const vlSuppVal = getStr(["VL Suppression Status", "VLSuppressionStatus", "Suppression Status"]);
  const artStatusVal = getStr(["Current ART Status", "CurrentARTStatus"]);
  const commEacVal = getStr(["Commenced on EAC", "CommencedonEAC"]);
  const startEacVal = getStr(["EAC Commencement Date", "EACCommencementDate"]);
  const compEacVal = getStr(["Completed EAC", "CompletedEAC"]);
  const endEacVal = getStr(["EAC Completion Date", "EACCompletionDate"]);
  const vlAfterEacVal = getStr(["VL Result After EAC", "VLResultAfterEAC"]);
  const tbScreenVal = getStr(["TB Screening Outcome", "TBScreeningOutcome"]);
  const refTbVal = getStr(["Referred for TB Diagnosis", "ReferredforTBDiagnosis"]);
  const tbDetectVal = getStr(["TB Detected", "TBDetected"]);
  const tbCadVal = getStr(["TB Evaluated using CAD", "TBEvaluatedusingCAD"]);
  const cadScoreVal = getStr(["CAD Score", "CADScore"]);
  const cadDateVal = getStr(["CAD Score Date", "CADScoreDate"]);
  const scoreRadVal = getStr(["Score Sent to Radiologist", "ScoreSenttoRadiologist"]);
  const eligTptVal = getStr(["Eligible for TB TPT", "EligibleforTBTPT"]);
  const commTptVal = getStr(["Commenced on TB Preventive", "CommencedonTBPreventive"]);
  const startTptVal = getStr(["TPT Commencement Date", "TPTCommencementDate"]);
  const compTptVal = getStr(["Completed TPT", "CompletedTPT"]);
  const endTptVal = getStr(["TPT Completion Date", "TPTCompletionDate"]);
  const weightVal = getNum(["Weight", "WEIGHT", "weight"]);
  const heightVal = getNum(["Height", "HEIGHT", "height"]);
  const bmiVal = getNum(["BMI", "bmi", "Bmi"]);
  const nutritionVal = getStr(["Nutrition Status", "NutritionStatus"]);
  const interventionsVal = getStr(["Interventions Provided", "InterventionsProvided"]);
  const refDateVal = getStr(["Latest Referral Date", "LatestReferralDate"]);
  const servProvidedVal = getStr(["Latest Services Provided", "LatestServicesProvided", "Services Provided"]);
  const dateServVal = getStr(["Date of Latest Service Provided", "DateOfLatestServiceProvided", "Date of Service", "Latest Service Date"]);
  const refStatusVal = getStr(["Latest Referral Status", "LatestReferralStatus"]);
  const refOrgVal = getStr(["Latest Referral Organization", "LatestReferralOrganization"]);
  const heiTrackVal = getStr(["HEI Tracking", "HEITracking"]);
  const motherArtVal = getStr(["Mother ART UID", "MotherARTUID"]);
  const firstPcrVal = getStr(["First PCR Result", "FirstPCRResult"]);
  const secondPcrVal = getStr(["Second PCR Result", "SecondPCRResult"]);
  
  const cgNameVal = getStr(["Caregiver Name", "CaregiverName"]);
  const cgSexVal = getStr(["Caregiver Sex", "CaregiverSex", "Caregiver Gender"]);
  const cgHivVal = getStr(["Caregiver HIV Status", "CaregiverHIVStatus"]);
  const cgPhoneVal = getStr(["Caregiver Phone", "CaregiverPhone"]);
  const cgRelVal = getStr(["Caregiver Relationship", "CaregiverRelationship"]);
  const ccwNameVal = getStr(["CCW Name", "CCWName", "CCW", "CCWName"]);
  const ccwEmailVal = getStr(["CCW Email", "CCWEmail"]);
  const ccwPhoneVal = getStr(["CCW Phone", "CCWPhone"]);

  return {
    State: stateVal,
    LGA: lgaVal,
    Ward: wardVal,
    Community: commVal,
    Address: addressVal,
    DateOfEnrolment: enrolDateVal,
    VCUniqueID: vcIdVal,
    ChildName: nameVal,
    Sex: sexVal,
    DateOfBirth: dobVal,
    Age: ageVal,
    AgeUnit: ageUnitVal,
    EnrolmentStream: streamVal,
    CurrentHIVStatus: hivStatusVal,
    PregnancyStatus: pregVal,
    DateOfCurrentHIVStatus: dateHivVal,
    ARTStartDate: artStartVal,
    CurrentARTFacility: facilityVal,
    HEIARTUID: heiArtVal,
    RegimenType: regimenTypeVal,
    CurrentRegimen: currentRegimenVal,
    NumberofARV: numArvVal,
    LastDrugPickup: lastPickupVal,
    NextAppointmentDate: nextApptVal,
    VLCarriedOut: vlCarriedVal,
    DateofVL: dateVlVal,
    VLSampleCollectionDate: vlSampleVal,
    VLResult: vlResultVal,
    VLSuppressionStatus: vlSuppVal,
    CurrentARTStatus: artStatusVal,
    CommencedonEAC: commEacVal,
    EACCommencementDate: startEacVal,
    CompletedEAC: compEacVal,
    EACCompletionDate: endEacVal,
    VLResultAfterEAC: vlAfterEacVal,
    TBScreeningOutcome: tbScreenVal,
    ReferredforTBDiagnosis: refTbVal,
    TBDetected: tbDetectVal,
    TBEvaluatedusingCAD: tbCadVal,
    CADScore: cadScoreVal,
    CADScoreDate: cadDateVal,
    ScoreSenttoRadiologist: scoreRadVal,
    EligibleforTBTPT: eligTptVal,
    CommencedonTBPreventive: commTptVal,
    TPTCommencementDate: startTptVal,
    CompletedTPT: compTptVal,
    TPTCompletionDate: endTptVal,
    Weight: weightVal,
    Height: heightVal,
    BMI: bmiVal,
    NutritionStatus: nutritionVal,
    InterventionsProvided: interventionsVal,
    LatestReferralDate: refDateVal,
    LatestServicesProvided: servProvidedVal,
    DateOfLatestServiceProvided: dateServVal,
    LatestReferralStatus: refStatusVal,
    LatestReferralOrganization: refOrgVal,
    HEITracking: heiTrackVal,
    MotherARTUID: motherArtVal,
    FirstPCRResult: firstPcrVal,
    SecondPCRResult: secondPcrVal,
    OVCStatus: statusVal,
    CaregiverName: cgNameVal,
    CaregiverSex: cgSexVal,
    CaregiverHIVStatus: cgHivVal,
    CaregiverPhone: cgPhoneVal,
    CaregiverRelationship: cgRelVal,
    CCWName: ccwNameVal,
    CCWEmail: ccwEmailVal,
    CCWPhone: ccwPhoneVal,
    originalRowIndex: index
  };
}

// Determines if a date falls inside a specified reporting period relative to a target date
export function isDateInReportingPeriod(
  serviceDate: Date,
  period: ReportingPeriod,
  startDateStr: string,
  endDateStr: string,
  targetDate: Date = new Date()
): boolean {
  const sTime = serviceDate.getTime();

  if (period === ReportingPeriod.CUSTOM) {
    const s = parseDate(startDateStr);
    const e = parseDate(endDateStr);
    if (!s || !e) return false;
    
    // Set boundaries: start of start day, end of end day
    const startBoundary = new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0);
    const endBoundary = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999);
    return sTime >= startBoundary.getTime() && sTime <= endBoundary.getTime();
  }

  // Set up target date windows
  const ty = targetDate.getFullYear();
  const tm = targetDate.getMonth();
  const td = targetDate.getDate();

  switch (period) {
    case ReportingPeriod.DAILY: {
      // Same calendar day
      return (
        serviceDate.getFullYear() === ty &&
        serviceDate.getMonth() === tm &&
        serviceDate.getDate() === td
      );
    }
    case ReportingPeriod.WEEKLY: {
      // Last 7 days ending on target date
      const endWindow = new Date(ty, tm, td, 23, 59, 59, 999).getTime();
      const startWindow = new Date(ty, tm, td - 6, 0, 0, 0, 0).getTime();
      return sTime >= startWindow && sTime <= endWindow;
    }
    case ReportingPeriod.MONTHLY: {
      // Same calendar month
      return serviceDate.getFullYear() === ty && serviceDate.getMonth() === tm;
    }
    case ReportingPeriod.QUARTERLY: {
      // Same quarter
      if (serviceDate.getFullYear() !== ty) return false;
      const targetQuarter = Math.floor(tm / 3);
      const serviceQuarter = Math.floor(serviceDate.getMonth() / 3);
      return targetQuarter === serviceQuarter;
    }
    case ReportingPeriod.SEMI_ANNUAL: {
      // Same half-year (H1: Jan-Jun, H2: Jul-Dec)
      if (serviceDate.getFullYear() !== ty) return false;
      const targetHalf = tm < 6 ? 0 : 1;
      const serviceHalf = serviceDate.getMonth() < 6 ? 0 : 1;
      return targetHalf === serviceHalf;
    }
    case ReportingPeriod.ANNUAL: {
      // Same calendar year
      return serviceDate.getFullYear() === ty;
    }
    default:
      return false;
  }
}

// Service detection engine: served only if Active, latest service date is present and falls within reporting period
export function isBeneficiaryServed(
  b: Beneficiary,
  filters: ReportFilters,
  targetDate: Date
): boolean {
  if (b.OVCStatus !== "Active") return false;
  const serviceDate = parseDate(b.DateOfLatestServiceProvided);
  if (!serviceDate) return false;

  return isDateInReportingPeriod(
    serviceDate,
    filters.ReportingPeriod,
    filters.StartDate,
    filters.EndDate,
    targetDate
  );
}

// Executes data quality validation on the raw rows and outputs a Data Quality Report
export function runDataQualityCheck(rawRows: any[]): DataQualitySummary {
  const issues: DQIssue[] = [];
  let duplicateVcIdsCount = 0;
  let blankCcwsCount = 0;
  let blankCommunitiesCount = 0;
  let blankLgasCount = 0;
  let blankWardsCount = 0;
  let invalidDatesCount = 0;

  const seenVcIds = new Map<string, number[]>();
  const seenNames = new Map<string, number[]>();

  rawRows.forEach((row, idx) => {
    const b = normalizeBeneficiary(row, idx + 2); // Excel rows are 1-indexed, headers are row 1, so data starts at row 2

    // 1. Validate required columns and blank fields
    if (!b.VCUniqueID) {
      issues.push({
        id: `dq-${idx}-vcid`,
        rowIndex: idx + 2,
        category: "Blank Field",
        field: "VC Unique ID",
        description: "Mandatory VC Unique ID is blank.",
        value: "",
        severity: "High"
      });
    } else {
      // Duplicate VC IDs tracking
      if (!seenVcIds.has(b.VCUniqueID)) {
        seenVcIds.set(b.VCUniqueID, []);
      }
      seenVcIds.get(b.VCUniqueID)!.push(idx + 2);
    }

    if (!b.ChildName) {
      issues.push({
        id: `dq-${idx}-name`,
        rowIndex: idx + 2,
        category: "Blank Field",
        field: "Child Name",
        description: "Mandatory Child Name is blank.",
        value: "",
        severity: "High"
      });
    } else {
      const normalizedName = b.ChildName.toLowerCase().replace(/\s+/g, "");
      if (!seenNames.has(normalizedName)) {
        seenNames.set(normalizedName, []);
      }
      seenNames.get(normalizedName)!.push(idx + 2);
    }

    if (!b.CCWName) {
      blankCcwsCount++;
      issues.push({
        id: `dq-${idx}-ccw`,
        rowIndex: idx + 2,
        category: "Blank Field",
        field: "CCW Name",
        description: "CCW Name is missing for this record.",
        value: "",
        severity: "Medium"
      });
    }

    if (!b.Community) {
      blankCommunitiesCount++;
      issues.push({
        id: `dq-${idx}-comm`,
        rowIndex: idx + 2,
        category: "Blank Field",
        field: "Community",
        description: "Community is missing for this record.",
        value: "",
        severity: "Medium"
      });
    }

    if (!b.LGA) {
      blankLgasCount++;
      issues.push({
        id: `dq-${idx}-lga`,
        rowIndex: idx + 2,
        category: "Blank Field",
        field: "LGA",
        description: "LGA is missing for this record.",
        value: "",
        severity: "High"
      });
    }

    if (!b.Ward) {
      blankWardsCount++;
      issues.push({
        id: `dq-${idx}-ward`,
        rowIndex: idx + 2,
        category: "Blank Field",
        field: "Ward",
        description: "Ward is missing for this record.",
        value: "",
        severity: "Medium"
      });
    }

    // 2. Validate dates
    if (b.DateOfEnrolment) {
      const d = parseDate(b.DateOfEnrolment);
      if (!d) {
        invalidDatesCount++;
        issues.push({
          id: `dq-${idx}-enroll-date`,
          rowIndex: idx + 2,
          category: "Invalid Date",
          field: "Date of Enrolment",
          description: `Unable to parse Date of Enrolment: "${b.DateOfEnrolment}".`,
          value: b.DateOfEnrolment,
          severity: "Medium"
        });
      }
    }

    if (b.DateOfLatestServiceProvided) {
      const d = parseDate(b.DateOfLatestServiceProvided);
      if (!d) {
        invalidDatesCount++;
        issues.push({
          id: `dq-${idx}-serv-date`,
          rowIndex: idx + 2,
          category: "Invalid Date",
          field: "Date of Latest Service Provided",
          description: `Unable to parse Service Date: "${b.DateOfLatestServiceProvided}".`,
          value: b.DateOfLatestServiceProvided,
          severity: "Medium"
        });
      }
    }
  });

  // Trace duplicate VC ID occurrences
  seenVcIds.forEach((rows, vcId) => {
    if (rows.length > 1) {
      duplicateVcIdsCount += (rows.length - 1);
      rows.forEach((rowNum) => {
        issues.push({
          id: `dq-dupvc-${vcId}-${rowNum}`,
          rowIndex: rowNum,
          vcId,
          category: "Duplicate VC ID",
          field: "VC Unique ID",
          description: `Duplicate VC Unique ID "${vcId}" found on row ${rowNum}. Duplicated in rows: ${rows.join(", ")}.`,
          value: vcId,
          severity: "High"
        });
      });
    }
  });

  // Trace duplicate beneficiary names (potential duplicate registrations)
  seenNames.forEach((rows, nameKey) => {
    if (rows.length > 1) {
      rows.forEach((rowNum) => {
        issues.push({
          id: `dq-dupname-${nameKey}-${rowNum}`,
          rowIndex: rowNum,
          category: "Duplicate Beneficiary Name",
          field: "Child Name",
          description: `Potential duplicate beneficiary registration name found on row ${rowNum}. Other occurrences in rows: ${rows.join(", ")}.`,
          value: nameKey,
          severity: "Low"
        });
      });
    }
  });

  return {
    totalRecords: rawRows.length,
    duplicateVcIds: duplicateVcIdsCount,
    blankCcws: blankCcwsCount,
    blankCommunities: blankCommunitiesCount,
    blankLgas: blankLgasCount,
    blankWards: blankWardsCount,
    invalidDates: invalidDatesCount,
    issues: issues.sort((a, b) => {
      const severityOrder = { High: 0, Medium: 1, Low: 2 };
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return (a.rowIndex || 0) - (b.rowIndex || 0);
    })
  };
}

// Executes math validation on the calculated counters to prevent showing inconsistent aggregates
export function validateCalculatedReport(
  totalServed: number,
  calhivServed: number,
  heiServed: number,
  activeCmp: number,
  outstanding: number,
  coverage: number
): ValidationResult {
  const errors: string[] = [];

  // Rule 1: Total Served = CALHIV Served + HEI Served
  if (totalServed !== calhivServed + heiServed) {
    errors.push(
      `Mathematical Discrepancy: Total Served (${totalServed}) does not equal the sum of CALHIV Served (${calhivServed}) and HEI Served (${heiServed}).`
    );
  }

  // Rule 2: Outstanding = Active CMP - Total Served
  if (outstanding !== activeCmp - totalServed) {
    errors.push(
      `Mathematical Discrepancy: Outstanding beneficiaries (${outstanding}) does not equal Active CMP (${activeCmp}) minus Total Served (${totalServed}).`
    );
  }

  // Rule 3: Total Served must never exceed Active CMP
  if (totalServed > activeCmp) {
    errors.push(
      `Inconsistent Data state: Total Served (${totalServed}) exceeds the total number of Active CMP Beneficiaries (${activeCmp}). Served counts must represent active, enrolled beneficiaries only.`
    );
  }

  // Rule 4: Coverage = (Total Served / Active CMP) * 100
  if (activeCmp > 0) {
    const expectedCoverage = (totalServed / activeCmp) * 100;
    // Allow small decimal variance due to floating-point rounding
    if (Math.abs(coverage - expectedCoverage) > 0.05) {
      errors.push(
        `Rounding Variance: Calculated coverage percentage (${coverage.toFixed(2)}%) differs significantly from expected mathematical formula (${expectedCoverage.toFixed(2)}%).`
      );
    }
  } else if (coverage !== 0) {
    errors.push(`Coverage should be 0% when there are no Active CMP beneficiaries, got ${coverage}%.`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Applies filters to a beneficiary record
export function passesFilters(b: Beneficiary, f: ReportFilters): boolean {
  if (f.State && b.State !== f.State) return false;
  if (f.LGA && b.LGA !== f.LGA) return false;
  if (f.Ward && b.Ward !== f.Ward) return false;
  if (f.Community && b.Community !== f.Community) return false;
  if (f.CCW && b.CCWName !== f.CCW) return false;
  if (f.Sex && b.Sex.toLowerCase() !== f.Sex.toLowerCase()) return false;
  
  if (f.AgeMin !== null && b.Age < f.AgeMin) return false;
  if (f.AgeMax !== null && b.Age > f.AgeMax) return false;

  if (f.OVCStatus && f.OVCStatus !== "All") {
    if (b.OVCStatus !== f.OVCStatus) return false;
  }

  if (f.EnrolmentStream && f.EnrolmentStream !== "All") {
    if (b.EnrolmentStream !== f.EnrolmentStream) return false;
  }

  if (f.CurrentHIVStatus && f.CurrentHIVStatus !== "All") {
    if (b.CurrentHIVStatus !== f.CurrentHIVStatus) return false;
  }

  return true;
}

// The core engine that processes all beneficiaries and generates CCW performance counters
export function generatePerformanceReport(
  beneficiaries: Beneficiary[],
  filters: ReportFilters,
  targetDate: Date
): {
  ccwRecords: CCWCounter[];
  aggregations: {
    ccw: AggregationNode[];
    community: AggregationNode[];
    ward: AggregationNode[];
    lga: AggregationNode[];
    state: AggregationNode[];
    overall: AggregationNode;
  };
  validation: ValidationResult;
} {
  // Step 1: Scan every beneficiary and determine performance counters grouped by CCW Name (and locations)
  const ccwMap = new Map<string, CCWCounter>();

  beneficiaries.forEach((b) => {
    // Apply filters
    if (!passesFilters(b, filters)) return;

    // CCW grouping key includes location attributes to prevent name collision across communities/states
    const ccwKey = `${b.State || "Unknown State"}|${b.LGA || "Unknown LGA"}|${b.Ward || "Unknown Ward"}|${b.Community || "Unknown Community"}|${b.CCWName || "Blank CCW"}`;

    if (!ccwMap.has(ccwKey)) {
      ccwMap.set(ccwKey, {
        CCWName: b.CCWName || "Blank CCW",
        CCWEmail: b.CCWEmail || "",
        CCWPhone: b.CCWPhone || "",
        Community: b.Community || "Unknown Community",
        Ward: b.Ward || "Unknown Ward",
        LGA: b.LGA || "Unknown LGA",
        State: b.State || "Unknown State",
        ActiveCMP: 0,
        ActiveCALHIV: 0,
        ActiveHEI: 0,
        CALHIVServed: 0,
        HEIServed: 0,
        TotalServed: 0,
        Outstanding: 0,
        Coverage: 0
      });
    }

    const counter = ccwMap.get(ccwKey)!;

    // Check OVC Status
    // "Only Active beneficiaries contribute to performance. Exclude Migrated, Inactive, Exited, Transferred Out, Deceased"
    if (b.OVCStatus === "Active") {
      counter.ActiveCMP++;

      // Programme disaggregation (CALHIV vs HEI)
      if (b.EnrolmentStream === "CALHIV") {
        counter.ActiveCALHIV++;
        
        // Service counting: falls inside selected period
        if (isBeneficiaryServed(b, filters, targetDate)) {
          counter.CALHIVServed++;
        }
      } else if (b.EnrolmentStream === "HEI") {
        counter.ActiveHEI++;
        
        // Service counting: falls inside selected period
        if (isBeneficiaryServed(b, filters, targetDate)) {
          counter.HEIServed++;
        }
      }
    }
  });

  // Calculate derivatives for CCW level records
  const ccwList = Array.from(ccwMap.values()).map((ccw) => {
    ccw.TotalServed = ccw.CALHIVServed + ccw.HEIServed;
    ccw.Outstanding = ccw.ActiveCMP - ccw.TotalServed;
    ccw.Coverage = ccw.ActiveCMP > 0 ? (ccw.TotalServed / ccw.ActiveCMP) * 100 : 0;
    return ccw;
  });

  // Step 2: Aggregation Engine. CCW -> Community -> Ward -> LGA -> State -> Program
  // Initialise structures
  const aggCommunity = new Map<string, AggregationNode>();
  const aggWard = new Map<string, AggregationNode>();
  const aggLGA = new Map<string, AggregationNode>();
  const aggState = new Map<string, AggregationNode>();
  const aggOverall: AggregationNode = {
    name: "National / Programme-wide Summary",
    ActiveCMP: 0,
    ActiveCALHIV: 0,
    ActiveHEI: 0,
    CALHIVServed: 0,
    HEIServed: 0,
    TotalServed: 0,
    Outstanding: 0,
    Coverage: 0,
    childCount: 0
  };

  const addNodeData = (node: AggregationNode, source: CCWCounter) => {
    node.ActiveCMP += source.ActiveCMP;
    node.ActiveCALHIV += source.ActiveCALHIV;
    node.ActiveHEI += source.ActiveHEI;
    node.CALHIVServed += source.CALHIVServed;
    node.HEIServed += source.HEIServed;
    node.TotalServed += source.TotalServed;
    node.Outstanding += source.Outstanding;
    node.childCount = (node.childCount || 0) + 1;
  };

  ccwList.forEach((ccw) => {
    // Overall aggregation
    addNodeData(aggOverall, ccw);

    // Community aggregation
    const commKey = `${ccw.State}|${ccw.LGA}|${ccw.Ward}|${ccw.Community}`;
    if (!aggCommunity.has(commKey)) {
      aggCommunity.set(commKey, {
        name: ccw.Community,
        ActiveCMP: 0,
        ActiveCALHIV: 0,
        ActiveHEI: 0,
        CALHIVServed: 0,
        HEIServed: 0,
        TotalServed: 0,
        Outstanding: 0,
        Coverage: 0,
        childCount: 0
      });
    }
    addNodeData(aggCommunity.get(commKey)!, ccw);

    // Ward aggregation
    const wardKey = `${ccw.State}|${ccw.LGA}|${ccw.Ward}`;
    if (!aggWard.has(wardKey)) {
      aggWard.set(wardKey, {
        name: ccw.Ward,
        ActiveCMP: 0,
        ActiveCALHIV: 0,
        ActiveHEI: 0,
        CALHIVServed: 0,
        HEIServed: 0,
        TotalServed: 0,
        Outstanding: 0,
        Coverage: 0,
        childCount: 0
      });
    }
    addNodeData(aggWard.get(wardKey)!, ccw);

    // LGA aggregation
    const lgaKey = `${ccw.State}|${ccw.LGA}`;
    if (!aggLGA.has(lgaKey)) {
      aggLGA.set(lgaKey, {
        name: ccw.LGA,
        ActiveCMP: 0,
        ActiveCALHIV: 0,
        ActiveHEI: 0,
        CALHIVServed: 0,
        HEIServed: 0,
        TotalServed: 0,
        Outstanding: 0,
        Coverage: 0,
        childCount: 0
      });
    }
    addNodeData(aggLGA.get(lgaKey)!, ccw);

    // State aggregation
    const stateKey = ccw.State;
    if (!aggState.has(stateKey)) {
      aggState.set(stateKey, {
        name: ccw.State,
        ActiveCMP: 0,
        ActiveCALHIV: 0,
        ActiveHEI: 0,
        CALHIVServed: 0,
        HEIServed: 0,
        TotalServed: 0,
        Outstanding: 0,
        Coverage: 0,
        childCount: 0
      });
    }
    addNodeData(aggState.get(stateKey)!, ccw);
  });

  // Re-calculate Coverages for all aggregated nodes
  const finalizeNode = (node: AggregationNode) => {
    node.Coverage = node.ActiveCMP > 0 ? (node.TotalServed / node.ActiveCMP) * 100 : 0;
  };

  finalizeNode(aggOverall);
  
  const communityList = Array.from(aggCommunity.values()).map(n => { finalizeNode(n); return n; });
  const wardList = Array.from(aggWard.values()).map(n => { finalizeNode(n); return n; });
  const lgaList = Array.from(aggLGA.values()).map(n => { finalizeNode(n); return n; });
  const stateList = Array.from(aggState.values()).map(n => { finalizeNode(n); return n; });
  const ccwNodeList = ccwList.map((c): AggregationNode => ({
    name: c.CCWName,
    ActiveCMP: c.ActiveCMP,
    ActiveCALHIV: c.ActiveCALHIV,
    ActiveHEI: c.ActiveHEI,
    CALHIVServed: c.CALHIVServed,
    HEIServed: c.HEIServed,
    TotalServed: c.TotalServed,
    Outstanding: c.Outstanding,
    Coverage: c.Coverage
  }));

  // Perform overall validation check
  const validation = validateCalculatedReport(
    aggOverall.TotalServed,
    aggOverall.CALHIVServed,
    aggOverall.HEIServed,
    aggOverall.ActiveCMP,
    aggOverall.Outstanding,
    aggOverall.Coverage
  );

  return {
    ccwRecords: ccwList,
    aggregations: {
      ccw: ccwNodeList.sort((a, b) => b.Coverage - a.Coverage),
      community: communityList.sort((a, b) => b.Coverage - a.Coverage),
      ward: wardList.sort((a, b) => b.Coverage - a.Coverage),
      lga: lgaList.sort((a, b) => b.Coverage - a.Coverage),
      state: stateList.sort((a, b) => b.Coverage - a.Coverage),
      overall: aggOverall
    },
    validation
  };
}
