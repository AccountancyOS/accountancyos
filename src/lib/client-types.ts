// Client type definitions for AccountancyOS
// These align with the database client_type column and lead_type
// Note: sole_trader and landlord have been removed per brief item #13
// sole_traders should use sa_non_mtd, landlords should use sa_non_mtd or sa_mtd

export const CLIENT_TYPES = [
  'sa_non_mtd',
  'sa_mtd',
  'partnership',
  'llp',
  'limited_company',
  'charity',
  'cgt',
  'other',
] as const;

export type ClientType = typeof CLIENT_TYPES[number];

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  sa_non_mtd: 'Self-Assessment (Non-MTD)',
  sa_mtd: 'Self-Assessment (MTD)',
  partnership: 'Partnership',
  llp: 'LLP',
  limited_company: 'Limited Company',
  charity: 'Charity',
  cgt: 'CGT Return',
  other: 'Other',
};

export const CLIENT_TYPE_DESCRIPTIONS: Record<ClientType, string> = {
  sa_non_mtd: 'Individual requiring Self-Assessment tax return (incl. sole traders & landlords)',
  sa_mtd: 'Individual on Making Tax Digital for Income Tax',
  partnership: 'Traditional partnership (non-LLP)',
  llp: 'Limited Liability Partnership',
  limited_company: 'Private or public limited company',
  charity: 'Registered charity or CIO',
  cgt: 'Capital Gains Tax disposal return client',
  other: 'Client type not listed above',
};

// Indicates which client types use the companies table vs clients table
export const COMPANY_BASED_TYPES: ClientType[] = ['limited_company', 'llp', 'charity'];
export const INDIVIDUAL_BASED_TYPES: ClientType[] = ['sa_non_mtd', 'sa_mtd', 'partnership', 'cgt', 'other'];

// Lead type mirrors client type for conversion flow
export type LeadType = ClientType;
export const LEAD_TYPES = CLIENT_TYPES;
export const LEAD_TYPE_LABELS = CLIENT_TYPE_LABELS;

// Field visibility by client type
export interface ClientTypeFieldConfig {
  showUtr: boolean;
  showNino: boolean;
  showVat: boolean;
  showCompanyNumber: boolean;
  showCharityNumber: boolean;
  showMtdQuarters: boolean;
  showPartners: boolean;
  showDisposalDate: boolean;
  showSicCode: boolean;
  detailTable: 'client_detail_sa' | 'client_detail_partnership' | 'client_detail_cgt' | 'client_detail_charity' | 'companies' | null;
}

export const CLIENT_TYPE_FIELD_CONFIG: Record<ClientType, ClientTypeFieldConfig> = {
  sa_non_mtd: {
    showUtr: true,
    showNino: true,
    showVat: false,
    showCompanyNumber: false,
    showCharityNumber: false,
    showMtdQuarters: false,
    showPartners: false,
    showDisposalDate: false,
    showSicCode: false,
    detailTable: 'client_detail_sa',
  },
  sa_mtd: {
    showUtr: true,
    showNino: true,
    showVat: false,
    showCompanyNumber: false,
    showCharityNumber: false,
    showMtdQuarters: true,
    showPartners: false,
    showDisposalDate: false,
    showSicCode: false,
    detailTable: 'client_detail_sa',
  },
  partnership: {
    showUtr: true,
    showNino: false,
    showVat: true,
    showCompanyNumber: false,
    showCharityNumber: false,
    showMtdQuarters: false,
    showPartners: true,
    showDisposalDate: false,
    showSicCode: false,
    detailTable: 'client_detail_partnership',
  },
  llp: {
    showUtr: true,
    showNino: false,
    showVat: true,
    showCompanyNumber: true,
    showCharityNumber: false,
    showMtdQuarters: false,
    showPartners: true,
    showDisposalDate: false,
    showSicCode: true,
    detailTable: 'companies',
  },
  limited_company: {
    showUtr: true,
    showNino: false,
    showVat: true,
    showCompanyNumber: true,
    showCharityNumber: false,
    showMtdQuarters: false,
    showPartners: false,
    showDisposalDate: false,
    showSicCode: true,
    detailTable: 'companies',
  },
  charity: {
    showUtr: false,
    showNino: false,
    showVat: false,
    showCompanyNumber: false,
    showCharityNumber: true,
    showMtdQuarters: false,
    showPartners: false,
    showDisposalDate: false,
    showSicCode: false,
    detailTable: 'client_detail_charity',
  },
  cgt: {
    showUtr: true,
    showNino: true,
    showVat: false,
    showCompanyNumber: false,
    showCharityNumber: false,
    showMtdQuarters: false,
    showPartners: false,
    showDisposalDate: true,
    showSicCode: false,
    detailTable: 'client_detail_cgt',
  },
  other: {
    showUtr: false,
    showNino: false,
    showVat: false,
    showCompanyNumber: false,
    showCharityNumber: false,
    showMtdQuarters: false,
    showPartners: false,
    showDisposalDate: false,
    showSicCode: false,
    detailTable: null,
  },
};

/**
 * Mapping from legacy/database type values to canonical ClientType
 * Handles variations like 'ltd' -> 'limited_company'
 * sole_trader and landlord are mapped to sa_non_mtd
 */
const DB_TYPE_MAP: Record<string, ClientType> = {
  ltd: "limited_company",
  limited_company: "limited_company",
  llp: "llp",
  charity: "charity",
  sa_non_mtd: "sa_non_mtd",
  sa_mtd: "sa_mtd",
  sole_trader: "sa_non_mtd", // Legacy: merged into SA Non-MTD
  landlord: "sa_non_mtd",    // Legacy: merged into SA Non-MTD
  partnership: "partnership",
  cgt: "cgt",
  other: "other",
};

/**
 * Normalize a database client/company type to canonical ClientType
 * Handles legacy values and case variations
 */
export function normalizeClientType(dbType: string | null | undefined): ClientType {
  if (!dbType) return "other";
  const normalized = DB_TYPE_MAP[dbType.toLowerCase()];
  return normalized || "other";
}

/**
 * Get a human-readable label for any client/company type value
 * Handles legacy database values by normalizing first
 */
export function getClientTypeLabel(type: string | null | undefined): string {
  if (!type) return "Other";
  const normalized = normalizeClientType(type);
  return CLIENT_TYPE_LABELS[normalized] || "Other";
}

/**
 * Check if a client type uses company record
 */
export function isCompanyBasedType(type: ClientType): boolean {
  return COMPANY_BASED_TYPES.includes(type);
}

/**
 * Get field config for a client type
 */
export function getClientTypeConfig(type: ClientType): ClientTypeFieldConfig {
  return CLIENT_TYPE_FIELD_CONFIG[type];
}
