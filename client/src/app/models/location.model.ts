export interface Address {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  raw?: string;
}

export interface SunroofData {
  solarPotentialKwhYear?: number;
  roofSegmentCount?: number;
  panelCapacityWatts?: number;
  roofAreaM2?: number;
  carbonOffsetFactorKgPerMwh?: number;
  percentCovered?: number;
  noCoverage?: boolean;
  lastUpdated?: string;
  ratePerKwh?: number;
  rateSource?: 'urdb' | 'eia_state_avg' | 'default';
}

export interface BuildingLocation {
  _id: string;
  source: LocationSource;
  sourceDetail?: { filingYear?: number; field?: string };
  address: Address;
  lat?: number;
  lng?: number;
  geocoded: boolean;
  confidence: number;
  sunroof?: SunroofData;
  solarBenefitScore?: number;
  estimatedAnnualSavings?: number;
}

export type LocationSource =
  | 'irs_primary'
  | 'form_990_narrative'
  | 'form_990_scheduleO'
  | 'county_assessor'
  | 'google_places';

export interface Location {
  _id: string;
  ein: string;
  source: LocationSource;
  address: Address;
  lat?: number;
  lng?: number;
  confidence: number;
  geocoded: boolean;
  sunroof?: SunroofData;
  solarBenefitScore?: number;
  estimatedAnnualSavings?: number;
  createdAt: string;
}

export interface LocationsResponse {
  results: Location[];
  total: number;
  page: number;
  limit: number;
}

export interface Nonprofit {
  _id: string;
  ein: string;
  name: string;
  address: Address;
  nteeCode?: string;
  revenue?: number;
  assets?: number;
  subsection?: string;
  deductibility?: string;
  foundation?: string;
  taxPeriod?: string;
  irsStatus?: string;
  solarBenefitScore?: number;
  estimatedAnnualSavings?: number;
  propertyNetBookValue?: number;
  latestFilingYear?: number;
  sunroof?: SunroofData;
  form990EnrichedAt?: string;
}

export interface NonprofitsResponse {
  results: Nonprofit[];
  total: number;
  page: number;
  limit: number;
}

export const NTEE_LABELS: Record<string, string> = {
  A: 'Arts & Culture', B: 'Education', C: 'Environment', D: 'Animal-Related',
  E: 'Health Care', F: 'Mental Health', G: 'Disease & Medical', H: 'Medical Research',
  I: 'Crime & Legal', J: 'Employment', K: 'Food & Agriculture', L: 'Housing & Shelter',
  M: 'Public Safety', N: 'Recreation & Sports', O: 'Youth Development', P: 'Human Services',
  Q: 'International Affairs', R: 'Civil Rights', S: 'Community Improvement',
  T: 'Philanthropy', U: 'Science & Technology', V: 'Social Science',
  W: 'Public Benefit', X: 'Religion', Y: 'Mutual Benefit', Z: 'Unknown',
};

export const SOURCE_LABELS: Record<LocationSource, string> = {
  irs_primary: 'IRS Filing',
  form_990_narrative: '990 Narrative',
  form_990_scheduleO: '990 Schedule O',
  county_assessor: 'County Assessor',
  google_places: 'Google Places',
};
