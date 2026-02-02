// Companies House API lookup service
// Uses the companies-house-sync edge function for server-side API calls

import { supabase } from "@/integrations/supabase/client";

export interface CHCompanyProfile {
  company_number: string;
  company_name: string;
  company_status: string;
  date_of_creation: string;
  type: string;
  registered_office_address: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    postal_code?: string;
    country?: string;
  };
  sic_codes?: string[];
  accounts?: {
    next_made_up_to?: string;
    next_due?: string;
    last_accounts?: {
      made_up_to?: string;
    };
  };
  confirmation_statement?: {
    next_due?: string;
  };
}

export interface CHSearchResult {
  company_number: string;
  title: string;
  company_status: string;
  address_snippet: string;
  date_of_creation: string;
  company_type: string;
}

export interface CHSearchResponse {
  items: CHSearchResult[];
  total_results: number;
}

/**
 * Search Companies House for companies by name
 */
export async function searchCompaniesHouse(
  query: string
): Promise<{ data: CHSearchResponse | null; error: string | null }> {
  if (!query || query.length < 2) {
    return { data: null, error: "Search query must be at least 2 characters" };
  }

  try {
    const { data, error } = await supabase.functions.invoke("companies-house-sync", {
      body: {
        action: "search",
        query: query.trim(),
      },
    });

    if (error) {
      console.error("CH search error:", error);
      return { data: null, error: error.message || "Failed to search Companies House" };
    }

    return { data: data as CHSearchResponse, error: null };
  } catch (err: any) {
    console.error("CH search exception:", err);
    return { data: null, error: err.message || "An unexpected error occurred" };
  }
}

/**
 * Get full company profile from Companies House
 */
export async function getCompanyProfile(
  companyNumber: string
): Promise<{ data: CHCompanyProfile | null; error: string | null }> {
  if (!companyNumber) {
    return { data: null, error: "Company number is required" };
  }

  try {
    const { data, error } = await supabase.functions.invoke("companies-house-sync", {
      body: {
        action: "profile",
        company_number: companyNumber.trim().toUpperCase(),
      },
    });

    if (error) {
      console.error("CH profile error:", error);
      return { data: null, error: error.message || "Failed to get company profile" };
    }

    return { data: data as CHCompanyProfile, error: null };
  } catch (err: any) {
    console.error("CH profile exception:", err);
    return { data: null, error: err.message || "An unexpected error occurred" };
  }
}

/**
 * Map CH profile to lead/company form fields
 */
export function mapCHProfileToFormData(profile: CHCompanyProfile) {
  const address = profile.registered_office_address || {};
  
  return {
    company_name: profile.company_name,
    company_number: profile.company_number,
    company_status: profile.company_status,
    date_of_creation: profile.date_of_creation,
    company_type: profile.type,
    address_line_1: address.address_line_1 || "",
    address_line_2: address.address_line_2 || "",
    city: address.locality || "",
    postcode: address.postal_code || "",
    sic_codes: profile.sic_codes || [],
    accounts_next_due: profile.accounts?.next_due || null,
    confirmation_statement_next_due: profile.confirmation_statement?.next_due || null,
  };
}
