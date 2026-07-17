/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Beneficiary {
  State: string;
  LGA: string;
  Ward: string;
  Community: string;
  Address: string;
  DateOfEnrolment: string; // ISO string or original format
  VCUniqueID: string;
  ChildName: string;
  Sex: string;
  DateOfBirth: string;
  Age: number;
  AgeUnit: string;
  EnrolmentStream: string; // 'CALHIV' | 'HEI' etc.
  CurrentHIVStatus: string;
  PregnancyStatus: string;
  DateOfCurrentHIVStatus: string;
  ARTStartDate: string;
  CurrentARTFacility: string;
  HEIARTUID: string;
  RegimenType: string;
  CurrentRegimen: string;
  NumberofARV: string | number;
  LastDrugPickup: string;
  NextAppointmentDate: string;
  VLCarriedOut: string;
  DateofVL: string;
  VLSampleCollectionDate: string;
  VLResult: string;
  VLSuppressionStatus: string;
  CurrentARTStatus: string;
  CommencedonEAC: string;
  EACCommencementDate: string;
  CompletedEAC: string;
  EACCompletionDate: string;
  VLResultAfterEAC: string;
  TBScreeningOutcome: string;
  ReferredforTBDiagnosis: string;
  TBDetected: string;
  TBEvaluatedusingCAD: string;
  CADScore: string | number;
  CADScoreDate: string;
  ScoreSenttoRadiologist: string;
  EligibleforTBTPT: string;
  CommencedonTBPreventive: string;
  TPTCommencementDate: string;
  CompletedTPT: string;
  TPTCompletionDate: string;
  Weight: number | null;
  Height: number | null;
  BMI: number | null;
  NutritionStatus: string;
  InterventionsProvided: string;
  LatestReferralDate: string;
  LatestServicesProvided: string;
  DateOfLatestServiceProvided: string;
  LatestReferralStatus: string;
  LatestReferralOrganization: string;
  HEITracking: string;
  MotherARTUID: string;
  FirstPCRResult: string;
  SecondPCRResult: string;
  OVCStatus: string; // 'Active' | 'Migrated' | 'Inactive' | 'Exited' | 'Transferred Out' | 'Deceased'
  CaregiverName: string;
  CaregiverSex: string;
  CaregiverHIVStatus: string;
  CaregiverPhone: string;
  CaregiverRelationship: string;
  CCWName: string;
  CCWEmail: string;
  CCWPhone: string;
  originalRowIndex: number; // for tracking
}

export interface CCWCounter {
  CCWName: string;
  CCWEmail: string;
  CCWPhone: string;
  Community: string;
  Ward: string;
  LGA: string;
  State: string;
  ActiveCMP: number;
  ActiveCALHIV: number;
  ActiveHEI: number;
  CALHIVServed: number;
  HEIServed: number;
  TotalServed: number;
  Outstanding: number;
  Coverage: number; // Percentage
}

export interface AggregationNode {
  name: string; // CCW, Community, Ward, LGA, State, or Program-wide
  ActiveCMP: number;
  ActiveCALHIV: number;
  ActiveHEI: number;
  CALHIVServed: number;
  HEIServed: number;
  TotalServed: number;
  Outstanding: number;
  Coverage: number;
  childCount?: number;
}

export enum ReportingPeriod {
  DAILY = "Daily",
  WEEKLY = "Weekly",
  MONTHLY = "Monthly",
  QUARTERLY = "Quarterly",
  SEMI_ANNUAL = "Semi-Annual",
  ANNUAL = "Annual",
  CUSTOM = "Custom Date Range",
}

export interface ReportFilters {
  State: string;
  LGA: string;
  Ward: string;
  Community: string;
  CCW: string;
  Sex: string;
  AgeMin: number | null;
  AgeMax: number | null;
  OVCStatus: string; // All or specific
  EnrolmentStream: string; // All, CALHIV, HEI
  ReportingPeriod: ReportingPeriod;
  StartDate: string; // YYYY-MM-DD
  EndDate: string; // YYYY-MM-DD
  CurrentHIVStatus: string; // All or specific status
}

export interface DQIssue {
  id: string;
  rowIndex?: number;
  vcId?: string;
  beneficiaryName?: string;
  category: "Duplicate VC ID" | "Blank Field" | "Invalid Date" | "Invalid Value" | "Duplicate Beneficiary Name";
  field: string;
  description: string;
  value: string;
  severity: "High" | "Medium" | "Low";
}

export interface DataQualitySummary {
  totalRecords: number;
  duplicateVcIds: number;
  blankCcws: number;
  blankCommunities: number;
  blankLgas: number;
  blankWards: number;
  invalidDates: number;
  issues: DQIssue[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface AINarrativeReport {
  executiveSummary: string;
  majorFindings: string;
  performanceAnalysis: {
    highPerformingCCWs: string[];
    lowPerformingCCWs: string[];
    highPerformingLGAs: string[];
    lowPerformingLGAs: string[];
  };
  outstandingFollowUp: string;
  communitiesIntervention: string;
  recommendations: string;
  conclusion: string;
}
