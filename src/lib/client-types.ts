// Client type definitions for AccountancyOS
// These align with the database client_type column and lead_type

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
  sa_non_mtd: 'Individual requiring Self-Assessment tax return',
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
    detailTable: null,
  },
};

// Helper to check if a client type uses company record
export function isCompanyBasedType(type: ClientType): boolean {
  return COMPANY_BASED_TYPES.includes(type);
}

// Helper to get field config
export function getClientTypeConfig(type: ClientType): ClientTypeFieldConfig {
  return CLIENT_TYPE_FIELD_CONFIG[type];
}
