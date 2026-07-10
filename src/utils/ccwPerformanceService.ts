/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Beneficiary, ReportFilters, ReportingPeriod } from "../types";
import { parseDate, isDateInReportingPeriod } from "./reportingEngine";

export interface CCWPerformanceRow {
  ccwName: string;
  lga: string;
  cmp: number;
  calhiv: number;
  hei: number;
  calhivServed: number;
  heiServed: number;
  totalServed: number;
  servedPercent: number;
  outstanding: number;
  community: string;
  ward: string;
  state: string;
}

export interface LGAPerformanceGroup {
  lgaName: string;
  cmp: number;
  calhiv: number;
  hei: number;
  calhivServed: number;
  heiServed: number;
  totalServed: number;
  servedPercent: number;
  outstanding: number;
  ccws: CCWPerformanceRow[];
}

export interface ValidationError {
  type: "CCW" | "LGA";
  name: string;
  parentLga?: string;
  message: string;
}

export interface CCWPerformanceReportResult {
  groups: LGAPerformanceGroup[];
  overallTotal: {
    cmp: number;
    calhiv: number;
    hei: number;
    calhivServed: number;
    heiServed: number;
    totalServed: number;
    servedPercent: number;
    outstanding: number;
  };
  validationErrors: ValidationError[];
}

/**
 * Service to compute the CCW Monthly Performance Report.
 * Uses only beneficiary-level records from the loaded database.
 */
export function calculateCCWPerformance(
  beneficiaries: Beneficiary[],
  filters: ReportFilters,
  targetDate: Date = new Date()
): CCWPerformanceReportResult {
  const ccwMap = new Map<string, CCWPerformanceRow>();

  // 1. Process active beneficiaries and accumulate totals by CCW + LGA grouping
  beneficiaries.forEach((b) => {
    // Only Active beneficiaries contribute to performance
    // Exclude: Inactive, Migrated, Exited, Transferred Out, Deceased
    if (b.OVCStatus !== "Active") {
      return;
    }

    // Only CALHIV and HEI enrolment streams are tracked in the CCW Monthly Performance Report
    if (b.EnrolmentStream !== "CALHIV" && b.EnrolmentStream !== "HEI") {
      return;
    }

    // Apply demographic and location filters if selected (except OVCStatus/EnrolmentStream which are controlled by report logic)
    if (filters.State && b.State !== filters.State) return;
    if (filters.LGA && b.LGA !== filters.LGA) return;
    if (filters.Ward && b.Ward !== filters.Ward) return;
    if (filters.Community && b.Community !== filters.Community) return;
    if (filters.CCW && b.CCWName !== filters.CCW) return;
    if (filters.Sex && b.Sex.toLowerCase() !== filters.Sex.toLowerCase()) return;
    if (filters.AgeMin !== null && b.Age < filters.AgeMin) return;
    if (filters.AgeMax !== null && b.Age > filters.AgeMax) return;

    const ccwName = b.CCWName || "Unassigned CCW";
    const lga = b.LGA || "Unassigned LGA";
    const key = `${lga}|${ccwName}`;

    if (!ccwMap.has(key)) {
      ccwMap.set(key, {
        ccwName,
        lga,
        cmp: 0,
        calhiv: 0,
        hei: 0,
        calhivServed: 0,
        heiServed: 0,
        totalServed: 0,
        servedPercent: 0,
        outstanding: 0,
        community: b.Community || "N/A",
        ward: b.Ward || "N/A",
        state: b.State || "N/A"
      });
    }

    const row = ccwMap.get(key)!;
    row.cmp++;

    // Increment CALHIV or HEI based on stream (using normalized streams)
    if (b.EnrolmentStream === "CALHIV") {
      row.calhiv++;
    } else if (b.EnrolmentStream === "HEI") {
      row.hei++;
    }

    // Check if beneficiary has been served in the selected period
    const serviceDate = parseDate(b.DateOfLatestServiceProvided);
    if (serviceDate) {
      const isServed = isDateInReportingPeriod(
        serviceDate,
        filters.ReportingPeriod,
        filters.StartDate,
        filters.EndDate,
        targetDate
      );

      if (isServed) {
        if (b.EnrolmentStream === "CALHIV") {
          row.calhivServed++;
        } else if (b.EnrolmentStream === "HEI") {
          row.heiServed++;
        }
      }
    }
  });

  // Calculate derivatives for each CCW record
  const ccwRows: CCWPerformanceRow[] = Array.from(ccwMap.values()).map((row) => {
    row.totalServed = row.calhivServed + row.heiServed;
    row.outstanding = row.cmp - row.totalServed;
    // Served % = (Total Served / CMP) * 100
    row.servedPercent = row.cmp > 0 ? Math.round((row.totalServed / row.cmp) * 100) : 0;
    return row;
  });

  // Group by LGA
  const lgaGroupsMap = new Map<string, CCWPerformanceRow[]>();
  ccwRows.forEach((row) => {
    if (!lgaGroupsMap.has(row.lga)) {
      lgaGroupsMap.set(row.lga, []);
    }
    lgaGroupsMap.get(row.lga)!.push(row);
  });

  const groups: LGAPerformanceGroup[] = [];
  const validationErrors: ValidationError[] = [];

  // Aggregate into LGA groups and run validation
  lgaGroupsMap.forEach((ccws, lgaName) => {
    // Sort CCWs alphabetically within each LGA
    ccws.sort((a, b) => a.ccwName.localeCompare(b.ccwName));

    let lgaCmp = 0;
    let lgaCalhiv = 0;
    let lgaHei = 0;
    let lgaCalhivServed = 0;
    let lgaHeiServed = 0;
    let lgaTotalServed = 0;

    ccws.forEach((c) => {
      lgaCmp += c.cmp;
      lgaCalhiv += c.calhiv;
      lgaHei += c.hei;
      lgaCalhivServed += c.calhivServed;
      lgaHeiServed += c.heiServed;
      lgaTotalServed += c.totalServed;

      // Validate each CCW row according to requirements:
      // 1. CMP = CALHIV + HEI
      if (c.cmp !== c.calhiv + c.hei) {
        validationErrors.push({
          type: "CCW",
          name: c.ccwName,
          parentLga: lgaName,
          message: `Mathematical Discrepancy for CCW "${c.ccwName}" in LGA "${lgaName}": Active CMP (${c.cmp}) does not equal CALHIV (${c.calhiv}) + HEI (${c.hei}).`
        });
      }
      // 2. Total Served = CALHIV Served + HEI Served
      if (c.totalServed !== c.calhivServed + c.heiServed) {
        validationErrors.push({
          type: "CCW",
          name: c.ccwName,
          parentLga: lgaName,
          message: `Mathematical Discrepancy for CCW "${c.ccwName}" in LGA "${lgaName}": Total Served (${c.totalServed}) does not equal CALHIV Served (${c.calhivServed}) + HEI Served (${c.heiServed}).`
        });
      }
      // 3. Outstanding = CMP - Total Served
      if (c.outstanding !== c.cmp - c.totalServed) {
        validationErrors.push({
          type: "CCW",
          name: c.ccwName,
          parentLga: lgaName,
          message: `Mathematical Discrepancy for CCW "${c.ccwName}" in LGA "${lgaName}": Outstanding (${c.outstanding}) does not equal CMP (${c.cmp}) minus Total Served (${c.totalServed}).`
        });
      }
      // 4. Total Served <= CMP
      if (c.totalServed > c.cmp) {
        validationErrors.push({
          type: "CCW",
          name: c.ccwName,
          parentLga: lgaName,
          message: `Inconsistent Data state for CCW "${c.ccwName}" in LGA "${lgaName}": Total Served (${c.totalServed}) exceeds Active CMP (${c.cmp}).`
        });
      }
      // 5. Served % = (Total Served / CMP) * 100
      const expectedServedPercent = c.cmp > 0 ? Math.round((c.totalServed / c.cmp) * 100) : 0;
      if (c.servedPercent !== expectedServedPercent) {
        validationErrors.push({
          type: "CCW",
          name: c.ccwName,
          parentLga: lgaName,
          message: `Mathematical Discrepancy for CCW "${c.ccwName}" in LGA "${lgaName}": Served % (${c.servedPercent}%) does not match expected percentage (${expectedServedPercent}%).`
        });
      }
    });

    const lgaOutstanding = lgaCmp - lgaTotalServed;
    const lgaServedPercent = lgaCmp > 0 ? Math.round((lgaTotalServed / lgaCmp) * 100) : 0;

    // Validate LGA aggregates
    // 1. CMP = CALHIV + HEI
    if (lgaCmp !== lgaCalhiv + lgaHei) {
      validationErrors.push({
        type: "LGA",
        name: lgaName,
        message: `Mathematical Discrepancy for LGA "${lgaName}": Aggregated CMP (${lgaCmp}) does not equal CALHIV (${lgaCalhiv}) + HEI (${lgaHei}).`
      });
    }
    // 2. Total Served = CALHIV Served + HEI Served
    if (lgaTotalServed !== lgaCalhivServed + lgaHeiServed) {
      validationErrors.push({
        type: "LGA",
        name: lgaName,
        message: `Mathematical Discrepancy for LGA "${lgaName}": Total Served (${lgaTotalServed}) does not equal CALHIV Served (${lgaCalhivServed}) + HEI Served (${lgaHeiServed}).`
      });
    }
    // 3. Outstanding = CMP - Total Served
    if (lgaOutstanding !== lgaCmp - lgaTotalServed) {
      validationErrors.push({
        type: "LGA",
        name: lgaName,
        message: `Mathematical Discrepancy for LGA "${lgaName}": Outstanding (${lgaOutstanding}) does not equal CMP (${lgaCmp}) minus Total Served (${lgaTotalServed}).`
      });
    }
    // 4. Total Served must never exceed CMP
    if (lgaTotalServed > lgaCmp) {
      validationErrors.push({
        type: "LGA",
        name: lgaName,
        message: `Inconsistent Data state for LGA "${lgaName}": Total Served (${lgaTotalServed}) exceeds Active CMP (${lgaCmp}).`
      });
    }
    // 5. Served % = (Total Served / CMP) * 100
    const expectedLgaServedPercent = lgaCmp > 0 ? Math.round((lgaTotalServed / lgaCmp) * 100) : 0;
    if (lgaServedPercent !== expectedLgaServedPercent) {
      validationErrors.push({
        type: "LGA",
        name: lgaName,
        message: `Mathematical Discrepancy for LGA "${lgaName}": Served % (${lgaServedPercent}%) does not match expected percentage (${expectedLgaServedPercent}%).`
      });
    }

    groups.push({
      lgaName,
      cmp: lgaCmp,
      calhiv: lgaCalhiv,
      hei: lgaHei,
      calhivServed: lgaCalhivServed,
      heiServed: lgaHeiServed,
      totalServed: lgaTotalServed,
      servedPercent: lgaServedPercent,
      outstanding: lgaOutstanding,
      ccws
    });
  });

  // Sort LGA groups alphabetically by LGA Name
  groups.sort((a, b) => a.lgaName.localeCompare(b.lgaName));

  // Compute overall grand total
  let grandCmp = 0;
  let grandCalhiv = 0;
  let grandHei = 0;
  let grandCalhivServed = 0;
  let grandHeiServed = 0;
  let grandTotalServed = 0;

  groups.forEach((g) => {
    grandCmp += g.cmp;
    grandCalhiv += g.calhiv;
    grandHei += g.hei;
    grandCalhivServed += g.calhivServed;
    grandHeiServed += g.heiServed;
    grandTotalServed += g.totalServed;
  });

  const grandOutstanding = grandCmp - grandTotalServed;
  const grandServedPercent = grandCmp > 0 ? Math.round((grandTotalServed / grandCmp) * 100) : 0;

  return {
    groups,
    overallTotal: {
      cmp: grandCmp,
      calhiv: grandCalhiv,
      hei: grandHei,
      calhivServed: grandCalhivServed,
      heiServed: grandHeiServed,
      totalServed: grandTotalServed,
      servedPercent: grandServedPercent,
      outstanding: grandOutstanding
    },
    validationErrors
  };
}
