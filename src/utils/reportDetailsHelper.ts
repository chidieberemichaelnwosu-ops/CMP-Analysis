/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Beneficiary, ReportFilters } from "../types";
import { parseDate, passesFilters } from "./reportingEngine";

export interface VLReportData {
  totalActive: number;
  vlCarriedOut: number;
  vlNotCarriedOut: number;
  vlSuppressed: number;
  vlUnsuppressed: number;
  suppressionRate: number;
  eligibleForVL: number; // CALHIV on ART > 6 months
  unsuppressedRoster: Array<{
    vcId: string;
    name: string;
    age: number;
    sex: string;
    ccw: string;
    artFacility: string;
    vlResult: string;
    dateOfVl: string;
  }>;
}

export interface TBReportData {
  totalActive: number;
  screened: number;
  notScreened: number;
  symptomatic: number;
  referred: number;
  tbDetected: number;
  eligibleForTpt: number;
  commencedTpt: number;
  completedTpt: number;
}

export interface NutritionReportData {
  totalActive: number;
  normal: number;
  mam: number; // Moderate Acute Malnutrition
  sam: number; // Severe Acute Malnutrition
  notAssessed: number;
  averageBmi: number;
}

export interface ReferralReportData {
  totalReferred: number;
  completed: number;
  pending: number;
  byOrganization: { [org: string]: number };
  recentReferrals: Array<{
    vcId: string;
    name: string;
    ccw: string;
    date: string;
    serviceNeeded: string;
    status: string;
    org: string;
  }>;
}

export interface HEIReportData {
  totalActiveHEI: number;
  pcr1Positive: number;
  pcr1Negative: number;
  pcr1Pending: number;
  pcr2Positive: number;
  pcr2Negative: number;
  pcr2Pending: number;
  heiTrackingActive: number;
}

export interface StatusReportData {
  totalUploaded: number;
  Active: number;
  Migrated: number;
  Inactive: number;
  Exited: number;
  TransferredOut: number;
  Deceased: number;
}

export function computeVLReport(beneficiaries: Beneficiary[], filters: ReportFilters): VLReportData {
  let totalActive = 0;
  let vlCarriedOut = 0;
  let vlNotCarriedOut = 0;
  let vlSuppressed = 0;
  let vlUnsuppressed = 0;
  let eligibleForVL = 0;
  const unsuppressedRoster: VLReportData["unsuppressedRoster"] = [];

  beneficiaries.forEach((b) => {
    if (!passesFilters(b, filters)) return;
    
    if (b.OVCStatus === "Active") {
      totalActive++;

      // Check eligibility (EnrolmentStream = CALHIV and has ART start date)
      if (b.EnrolmentStream === "CALHIV" && b.ARTStartDate) {
        eligibleForVL++;
      }

      const carriesOut = String(b.VLCarriedOut).toLowerCase().trim();
      const suppression = String(b.VLSuppressionStatus).toLowerCase().trim();

      if (carriesOut === "yes" || carriesOut === "true" || b.VLResult || b.DateofVL) {
        vlCarriedOut++;
        if (suppression === "suppressed") {
          vlSuppressed++;
        } else if (suppression === "unsuppressed" || suppression === "not suppressed") {
          vlUnsuppressed++;
          unsuppressedRoster.push({
            vcId: b.VCUniqueID,
            name: b.ChildName || "Anonymous",
            age: b.Age,
            sex: b.Sex,
            ccw: b.CCWName || "Unassigned",
            artFacility: b.CurrentARTFacility || "Unknown Facility",
            vlResult: b.VLResult || "N/A",
            dateOfVl: b.DateofVL || "Unknown"
          });
        } else {
          // If unsuppressed is specified in VL Result (e.g. numeric > 1000)
          const numericResult = parseFloat(String(b.VLResult).replace(/[^0-9.]/g, ""));
          if (!isNaN(numericResult) && numericResult >= 1000) {
            vlUnsuppressed++;
            unsuppressedRoster.push({
              vcId: b.VCUniqueID,
              name: b.ChildName || "Anonymous",
              age: b.Age,
              sex: b.Sex,
              ccw: b.CCWName || "Unassigned",
              artFacility: b.CurrentARTFacility || "Unknown Facility",
              vlResult: b.VLResult,
              dateOfVl: b.DateofVL || "Unknown"
            });
          } else if (!isNaN(numericResult) && numericResult < 1000) {
            vlSuppressed++;
          } else {
            vlNotCarriedOut++;
          }
        }
      } else {
        vlNotCarriedOut++;
      }
    }
  });

  return {
    totalActive,
    vlCarriedOut,
    vlNotCarriedOut,
    vlSuppressed,
    vlUnsuppressed,
    suppressionRate: vlCarriedOut > 0 ? (vlSuppressed / vlCarriedOut) * 100 : 0,
    eligibleForVL,
    unsuppressedRoster
  };
}

export function computeTBReport(beneficiaries: Beneficiary[], filters: ReportFilters): TBReportData {
  let totalActive = 0;
  let screened = 0;
  let notScreened = 0;
  let symptomatic = 0;
  let referred = 0;
  let tbDetected = 0;
  let eligibleForTpt = 0;
  let commencedTpt = 0;
  let completedTpt = 0;

  beneficiaries.forEach((b) => {
    if (!passesFilters(b, filters)) return;

    if (b.OVCStatus === "Active") {
      totalActive++;

      const outcome = String(b.TBScreeningOutcome).toLowerCase().trim();
      const detected = String(b.TBDetected).toLowerCase().trim();
      const eligibleTpt = String(b.EligibleforTBTPT).toLowerCase().trim();
      const commTpt = String(b.CommencedonTBPreventive).toLowerCase().trim();
      const compTpt = String(b.CompletedTPT).toLowerCase().trim();
      const refTb = String(b.ReferredforTBDiagnosis).toLowerCase().trim();

      if (outcome && outcome !== "n/a" && outcome !== "none") {
        screened++;
        if (outcome.includes("symptomatic") || outcome.includes("presumptive")) {
          symptomatic++;
        }
      } else {
        notScreened++;
      }

      if (refTb === "yes" || refTb === "true") {
        referred++;
      }

      if (detected === "yes" || detected === "true") {
        tbDetected++;
      }

      if (eligibleTpt === "yes" || eligibleTpt === "true") {
        eligibleForTpt++;
      }

      if (commTpt === "yes" || commTpt === "true" || b.TPTCommencementDate) {
        commencedTpt++;
      }

      if (compTpt === "yes" || compTpt === "true" || b.TPTCompletionDate) {
        completedTpt++;
      }
    }
  });

  return {
    totalActive,
    screened,
    notScreened,
    symptomatic,
    referred,
    tbDetected,
    eligibleForTpt,
    commencedTpt,
    completedTpt
  };
}

export function computeNutritionReport(beneficiaries: Beneficiary[], filters: ReportFilters): NutritionReportData {
  let totalActive = 0;
  let normal = 0;
  let mam = 0;
  let sam = 0;
  let notAssessed = 0;
  let sumBmi = 0;
  let bmiCount = 0;

  beneficiaries.forEach((b) => {
    if (!passesFilters(b, filters)) return;

    if (b.OVCStatus === "Active") {
      totalActive++;

      const status = String(b.NutritionStatus).toUpperCase().trim();
      
      if (status.includes("NORMAL")) {
        normal++;
      } else if (status.includes("MAM") || status.includes("MODERATE") || status.includes("UNDERWEIGHT")) {
        mam++;
      } else if (status.includes("SAM") || status.includes("SEVERE") || status.includes("WASTED") || status.includes("MALNOURISHED")) {
        sam++;
      } else if (status === "" || status === "N/A" || status === "NULL") {
        notAssessed++;
      } else {
        normal++; // default/fallback
      }

      if (b.BMI && b.BMI > 0) {
        sumBmi += b.BMI;
        bmiCount++;
      }
    }
  });

  return {
    totalActive,
    normal,
    mam,
    sam,
    notAssessed,
    averageBmi: bmiCount > 0 ? sumBmi / bmiCount : 0
  };
}

export function computeReferralReport(beneficiaries: Beneficiary[], filters: ReportFilters): ReferralReportData {
  let totalReferred = 0;
  let completed = 0;
  let pending = 0;
  const byOrganization: ReferralReportData["byOrganization"] = {};
  const recentReferrals: ReferralReportData["recentReferrals"] = [];

  beneficiaries.forEach((b) => {
    if (!passesFilters(b, filters)) return;

    const referralDate = b.LatestReferralDate || b.DateOfLatestServiceProvided;
    const refOrg = b.LatestReferralOrganization || "Unknown Org";
    const refStatus = String(b.LatestReferralStatus).toLowerCase().trim();

    if (referralDate && referralDate !== "N/A" && b.OVCStatus === "Active") {
      totalReferred++;

      if (refStatus === "completed" || refStatus === "successful" || refStatus === "yes") {
        completed++;
      } else {
        pending++;
      }

      byOrganization[refOrg] = (byOrganization[refOrg] || 0) + 1;

      if (recentReferrals.length < 20) {
        recentReferrals.push({
          vcId: b.VCUniqueID,
          name: b.ChildName || "Anonymous",
          ccw: b.CCWName || "Unassigned",
          date: referralDate,
          serviceNeeded: b.LatestServicesProvided || b.InterventionsProvided || "General Medical",
          status: b.LatestReferralStatus || "Pending",
          org: refOrg
        });
      }
    }
  });

  return {
    totalReferred,
    completed,
    pending,
    byOrganization,
    recentReferrals
  };
}

export function computeHEIReport(beneficiaries: Beneficiary[], filters: ReportFilters): HEIReportData {
  let totalActiveHEI = 0;
  let pcr1Positive = 0;
  let pcr1Negative = 0;
  let pcr1Pending = 0;
  let pcr2Positive = 0;
  let pcr2Negative = 0;
  let pcr2Pending = 0;
  let heiTrackingActive = 0;

  beneficiaries.forEach((b) => {
    if (!passesFilters(b, filters)) return;

    // Use Enrolment Stream only to determine HEI
    if (b.EnrolmentStream === "HEI" && b.OVCStatus === "Active") {
      totalActiveHEI++;

      const pcr1 = String(b.FirstPCRResult).toLowerCase().trim();
      const pcr2 = String(b.SecondPCRResult).toLowerCase().trim();
      const tracking = String(b.HEITracking).toLowerCase().trim();

      if (pcr1.includes("pos")) pcr1Positive++;
      else if (pcr1.includes("neg")) pcr1Negative++;
      else if (pcr1) pcr1Pending++;

      if (pcr2.includes("pos")) pcr2Positive++;
      else if (pcr2.includes("neg")) pcr2Negative++;
      else if (pcr2) pcr2Pending++;

      if (tracking === "yes" || tracking === "true" || tracking === "active") {
        heiTrackingActive++;
      }
    }
  });

  return {
    totalActiveHEI,
    pcr1Positive,
    pcr1Negative,
    pcr1Pending,
    pcr2Positive,
    pcr2Negative,
    pcr2Pending,
    heiTrackingActive
  };
}

export function computeStatusReport(beneficiaries: Beneficiary[], filters: ReportFilters): StatusReportData {
  let Active = 0;
  let Migrated = 0;
  let Inactive = 0;
  let Exited = 0;
  let TransferredOut = 0;
  let Deceased = 0;

  beneficiaries.forEach((b) => {
    // Only apply filters that are not status-dependent
    const filtersWithoutStatus = { ...filters, OVCStatus: "All" };
    if (!passesFilters(b, filtersWithoutStatus)) return;

    const status = b.OVCStatus || "Inactive";
    if (status === "Active") Active++;
    else if (status === "Migrated") Migrated++;
    else if (status === "Inactive") Inactive++;
    else if (status === "Exited") Exited++;
    else if (status === "Transferred Out") TransferredOut++;
    else if (status === "Deceased") Deceased++;
    else Inactive++;
  });

  return {
    totalUploaded: beneficiaries.length,
    Active,
    Migrated,
    Inactive,
    Exited,
    TransferredOut,
    Deceased
  };
}
