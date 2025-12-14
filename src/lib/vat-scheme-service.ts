// VAT Scheme Service
// Manages VAT registrations and provides scheme-specific logic

import { supabase } from "@/integrations/supabase/client";

export type VATScheme = 'STANDARD' | 'CASH_ACCOUNTING' | 'FLAT_RATE' | 'ANNUAL_ACCOUNTING';

export interface VATRegistration {
  id: string;
  organization_id: string;
  company_id?: string;
  client_id?: string;
  vrn: string;
  scheme: VATScheme;
  
  // Flat Rate
  flat_rate_percentage?: number;
  flat_rate_trade_sector?: string;
  flat_rate_first_year_discount?: boolean;
  
  // Cash Accounting
  cash_scheme_joined_at?: string;
  cash_scheme_threshold?: number;
  
  // Annual Accounting
  annual_accounting_joined_at?: string;
  annual_accounting_payment_schedule?: 'MONTHLY' | 'QUARTERLY';
  
  // Partial Exemption
  partial_exemption_applicable?: boolean;
  partial_exemption_rate?: number;
  partial_exemption_method?: 'STANDARD' | 'SPECIAL';
  
  // Dates
  effective_from: string;
  effective_to?: string;
  
  created_at: string;
  updated_at: string;
  notes?: string;
}

export interface VATSchemeParams {
  scheme: VATScheme;
  flatRatePercentage?: number;
  flatRateCategory?: string;
  flatRateFirstYearDiscount?: boolean;
  partialExemptionRate?: number;
  cashAccountingEnabled?: boolean;
}

// HMRC Flat Rate percentages by trade sector
export const FLAT_RATE_SECTORS: Record<string, { name: string; rate: number; firstYearRate: number }> = {
  'ACCOUNTANCY': { name: 'Accountancy or book-keeping', rate: 14.5, firstYearRate: 13.5 },
  'ADVERTISING': { name: 'Advertising', rate: 11, firstYearRate: 10 },
  'AGRICULTURAL': { name: 'Agricultural services', rate: 11, firstYearRate: 10 },
  'ARCHITECTS': { name: 'Architects, civil and structural engineers, surveyors', rate: 14.5, firstYearRate: 13.5 },
  'BOARDING': { name: 'Boarding or care of animals', rate: 12, firstYearRate: 11 },
  'BUSINESS_SERVICES': { name: 'Business services not listed elsewhere', rate: 12, firstYearRate: 11 },
  'CATERING': { name: 'Catering services including restaurants and takeaways', rate: 12.5, firstYearRate: 11.5 },
  'COMPUTER_IT': { name: 'Computer and IT consultancy or data processing', rate: 14.5, firstYearRate: 13.5 },
  'COMPUTER_REPAIR': { name: 'Computer repair services', rate: 10.5, firstYearRate: 9.5 },
  'ENTERTAINMENT': { name: 'Entertainment or journalism', rate: 12.5, firstYearRate: 11.5 },
  'ESTATE_AGENTS': { name: 'Estate agency or property management services', rate: 12, firstYearRate: 11 },
  'FARMING': { name: 'Farming or agriculture not listed elsewhere', rate: 6.5, firstYearRate: 5.5 },
  'FILM_TV': { name: 'Film, radio, television or video production', rate: 13, firstYearRate: 12 },
  'FINANCIAL_SERVICES': { name: 'Financial services', rate: 13.5, firstYearRate: 12.5 },
  'FORESTRY': { name: 'Forestry or fishing', rate: 10.5, firstYearRate: 9.5 },
  'GENERAL_BUILDING': { name: 'General building or construction services', rate: 9.5, firstYearRate: 8.5 },
  'HAIRDRESSING': { name: 'Hairdressing or other beauty treatment services', rate: 13, firstYearRate: 12 },
  'HIRING_GOODS': { name: 'Hiring of goods', rate: 9.5, firstYearRate: 8.5 },
  'HOTEL': { name: 'Hotel or accommodation', rate: 10.5, firstYearRate: 9.5 },
  'INVESTIGATION': { name: 'Investigation or security services', rate: 12, firstYearRate: 11 },
  'LABOUR_ONLY': { name: 'Labour-only building or construction services', rate: 14.5, firstYearRate: 13.5 },
  'LAUNDRY': { name: 'Laundry or dry-cleaning services', rate: 12, firstYearRate: 11 },
  'LAWYER': { name: 'Lawyer or legal services', rate: 14.5, firstYearRate: 13.5 },
  'LIBRARY': { name: 'Library, archive, museum or other cultural activity', rate: 9.5, firstYearRate: 8.5 },
  'MANAGEMENT_CONSULTANCY': { name: 'Management consultancy', rate: 14, firstYearRate: 13 },
  'MANUFACTURING': { name: 'Manufacturing of fabricated metal products', rate: 10.5, firstYearRate: 9.5 },
  'MANUFACTURING_FOOD': { name: 'Manufacturing food', rate: 9, firstYearRate: 8 },
  'MANUFACTURING_OTHER': { name: 'Manufacturing not listed elsewhere', rate: 9.5, firstYearRate: 8.5 },
  'MEMBERSHIP': { name: 'Membership organisation', rate: 8, firstYearRate: 7 },
  'MINING': { name: 'Mining or quarrying', rate: 10, firstYearRate: 9 },
  'PACKAGING': { name: 'Packaging', rate: 9, firstYearRate: 8 },
  'PHOTOGRAPHY': { name: 'Photography', rate: 11, firstYearRate: 10 },
  'POST_OFFICES': { name: 'Post offices', rate: 5, firstYearRate: 4 },
  'PRINTING': { name: 'Printing', rate: 8.5, firstYearRate: 7.5 },
  'PUBLISHING': { name: 'Publishing', rate: 11, firstYearRate: 10 },
  'PUBS': { name: 'Pubs', rate: 6.5, firstYearRate: 5.5 },
  'REAL_ESTATE': { name: 'Real estate activity (not covered elsewhere)', rate: 14, firstYearRate: 13 },
  'REPAIRING': { name: 'Repairing personal or household goods', rate: 10, firstYearRate: 9 },
  'REPAIRING_VEHICLES': { name: 'Repairing of vehicles', rate: 8.5, firstYearRate: 7.5 },
  'RETAILING': { name: 'Retailing not listed elsewhere', rate: 7.5, firstYearRate: 6.5 },
  'RETAILING_FOOD': { name: 'Retailing food, confectionery, tobacco, newspapers or children\'s clothing', rate: 4, firstYearRate: 3 },
  'RETAILING_VEHICLES': { name: 'Retailing vehicles or fuel', rate: 6.5, firstYearRate: 5.5 },
  'SECRETARIAL': { name: 'Secretarial services', rate: 13, firstYearRate: 12 },
  'SOCIAL_WORK': { name: 'Social work', rate: 11, firstYearRate: 10 },
  'SPORT': { name: 'Sport or recreation', rate: 8.5, firstYearRate: 7.5 },
  'TRANSPORT': { name: 'Transport or storage, including couriers, freight, removals and taxis', rate: 10, firstYearRate: 9 },
  'TRAVEL': { name: 'Travel agency', rate: 10.5, firstYearRate: 9.5 },
  'VETERINARY': { name: 'Veterinary medicine', rate: 11, firstYearRate: 10 },
  'WHOLESALING': { name: 'Wholesaling agricultural products', rate: 8, firstYearRate: 7 },
  'WHOLESALING_FOOD': { name: 'Wholesaling food', rate: 7.5, firstYearRate: 6.5 },
  'WHOLESALING_OTHER': { name: 'Wholesaling not listed elsewhere', rate: 8.5, firstYearRate: 7.5 },
  'LIMITED_COST': { name: 'Limited cost trader', rate: 16.5, firstYearRate: 15.5 },
};

/**
 * Get the active VAT registration for an entity
 */
export async function getActiveVATRegistration(
  entityId: string,
  entityType: 'company' | 'client',
  asOfDate?: string
): Promise<VATRegistration | null> {
  const dateFilter = asOfDate || new Date().toISOString().split('T')[0];
  
  const entityFilter = entityType === 'company'
    ? { company_id: entityId }
    : { client_id: entityId };

  const { data, error } = await supabase
    .from('vat_registrations')
    .select('*')
    .match(entityFilter)
    .lte('effective_from', dateFilter)
    .or(`effective_to.is.null,effective_to.gte.${dateFilter}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching VAT registration:', error);
    return null;
  }

  return data as VATRegistration | null;
}

/**
 * Get VAT scheme parameters for VAT period generation
 */
export async function getVATSchemeParams(
  entityId: string,
  entityType: 'company' | 'client',
  periodEndDate: string
): Promise<VATSchemeParams> {
  const registration = await getActiveVATRegistration(entityId, entityType, periodEndDate);
  
  if (!registration) {
    // Default to standard scheme if no registration found
    return { scheme: 'STANDARD' };
  }

  const params: VATSchemeParams = {
    scheme: registration.scheme,
  };

  // Flat Rate Scheme parameters
  if (registration.scheme === 'FLAT_RATE') {
    let rate = registration.flat_rate_percentage || 0;
    
    // Apply first-year discount if applicable
    if (registration.flat_rate_first_year_discount && registration.effective_from) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (new Date(registration.effective_from) > oneYearAgo) {
        rate = Math.max(0, rate - 1); // 1% first year discount
      }
    }
    
    params.flatRatePercentage = rate;
    params.flatRateCategory = registration.flat_rate_trade_sector;
    params.flatRateFirstYearDiscount = registration.flat_rate_first_year_discount;
  }

  // Cash Accounting
  if (registration.scheme === 'CASH_ACCOUNTING') {
    params.cashAccountingEnabled = true;
  }

  // Partial Exemption (can apply to any scheme)
  if (registration.partial_exemption_applicable && registration.partial_exemption_rate) {
    params.partialExemptionRate = Number(registration.partial_exemption_rate);
  }

  return params;
}

/**
 * Create or update a VAT registration
 */
export async function saveVATRegistration(
  organizationId: string,
  entityId: string,
  entityType: 'company' | 'client',
  data: Partial<VATRegistration>
): Promise<VATRegistration> {
  const entityData = entityType === 'company'
    ? { company_id: entityId, client_id: null }
    : { client_id: entityId, company_id: null };

  // If updating existing, close it first and create new
  if (data.id) {
    // End the current registration
    await supabase
      .from('vat_registrations')
      .update({ effective_to: data.effective_from })
      .eq('id', data.id);
  }

  const { data: created, error } = await supabase
    .from('vat_registrations')
    .insert({
      organization_id: organizationId,
      ...entityData,
      vrn: data.vrn || '',
      scheme: data.scheme || 'STANDARD',
      flat_rate_percentage: data.flat_rate_percentage,
      flat_rate_trade_sector: data.flat_rate_trade_sector,
      flat_rate_first_year_discount: data.flat_rate_first_year_discount,
      cash_scheme_joined_at: data.cash_scheme_joined_at,
      annual_accounting_joined_at: data.annual_accounting_joined_at,
      annual_accounting_payment_schedule: data.annual_accounting_payment_schedule,
      partial_exemption_applicable: data.partial_exemption_applicable,
      partial_exemption_rate: data.partial_exemption_rate,
      partial_exemption_method: data.partial_exemption_method,
      effective_from: data.effective_from || new Date().toISOString().split('T')[0],
      effective_to: null,
      notes: data.notes,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save VAT registration: ${error.message}`);
  }

  return created as VATRegistration;
}

/**
 * Get VAT registration history for an entity
 */
export async function getVATRegistrationHistory(
  entityId: string,
  entityType: 'company' | 'client'
): Promise<VATRegistration[]> {
  const entityFilter = entityType === 'company'
    ? { company_id: entityId }
    : { client_id: entityId };

  const { data, error } = await supabase
    .from('vat_registrations')
    .select('*')
    .match(entityFilter)
    .order('effective_from', { ascending: false });

  if (error) {
    console.error('Error fetching VAT registration history:', error);
    return [];
  }

  return (data || []) as VATRegistration[];
}

/**
 * Validate scheme eligibility
 */
export function validateSchemeEligibility(
  scheme: VATScheme,
  params: {
    turnover?: number;
    flatRatePercentage?: number;
    cashSchemeJoinedAt?: string;
  }
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (scheme === 'CASH_ACCOUNTING') {
    // Cash accounting threshold is £1.35m
    if (params.turnover && params.turnover > 1350000) {
      warnings.push('Turnover exceeds £1.35m threshold for Cash Accounting Scheme');
    }
  }

  if (scheme === 'FLAT_RATE') {
    if (!params.flatRatePercentage) {
      warnings.push('Flat rate percentage must be specified');
    }
    // Flat rate scheme threshold is £150k
    if (params.turnover && params.turnover > 150000) {
      warnings.push('Check eligibility: Flat Rate Scheme has £150k joining threshold');
    }
  }

  if (scheme === 'ANNUAL_ACCOUNTING') {
    // Annual accounting threshold is £1.35m
    if (params.turnover && params.turnover > 1350000) {
      warnings.push('Turnover exceeds £1.35m threshold for Annual Accounting Scheme');
    }
  }

  return {
    valid: warnings.length === 0 || !warnings.some(w => w.includes('must be')),
    warnings,
  };
}

/**
 * Get scheme description for display
 */
export function getSchemeDescription(scheme: VATScheme): string {
  switch (scheme) {
    case 'STANDARD':
      return 'Standard VAT accounting - VAT due when invoice is raised/received';
    case 'CASH_ACCOUNTING':
      return 'Cash Accounting - VAT due when payment is received/made';
    case 'FLAT_RATE':
      return 'Flat Rate Scheme - Simplified VAT based on percentage of gross turnover';
    case 'ANNUAL_ACCOUNTING':
      return 'Annual Accounting - Submit one VAT return per year with interim payments';
    default:
      return '';
  }
}
