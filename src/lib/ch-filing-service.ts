/**
 * Companies House Filing Service
 * Client-side service for submitting filings to Companies House via edge function
 */

import { supabase } from "@/integrations/supabase/client";

export interface CHFilingSubmitParams {
  filingId: string;
  environment: 'test' | 'production';
}

export interface CHFilingSubmitResult {
  success: boolean;
  submissionId?: string;
  transactionId?: string;
  status?: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'error';
  message?: string;
  errors?: Array<{
    code: string;
    description: string;
  }>;
}

/**
 * Submit a filing to Companies House
 */
export async function submitFilingToCompaniesHouse(
  params: CHFilingSubmitParams
): Promise<CHFilingSubmitResult> {
  try {
    const { data, error } = await supabase.functions.invoke('ch-submit', {
      body: params,
    });

    if (error) {
      return {
        success: false,
        status: 'error',
        message: error.message,
      };
    }

    return data as CHFilingSubmitResult;
  } catch (err: any) {
    return {
      success: false,
      status: 'error',
      message: err.message || 'Failed to submit filing',
    };
  }
}

/**
 * Get recent filing submissions for an organization
 */
export async function getFilingSubmissions(
  organizationId: string,
  options?: {
    filingId?: string;
    limit?: number;
  }
): Promise<any[]> {
  let query = supabase
    .from('filing_submissions')
    .select('*')
    .eq('organization_id', organizationId)
    .order('submitted_at', { ascending: false });

  if (options?.filingId) {
    query = query.eq('filing_id', options.filingId);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[CH Filing] Failed to fetch submissions:', error);
    return [];
  }

  return data || [];
}

/**
 * Get the latest submission for a specific filing
 */
export async function getLatestFilingSubmission(filingId: string) {
  const { data, error } = await supabase
    .from('filing_submissions')
    .select('*')
    .eq('filing_id', filingId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[CH Filing] Failed to fetch latest submission:', error);
    return null;
  }

  return data;
}

/**
 * Check if filing is ready to submit to Companies House
 */
export async function validateFilingReadyForSubmission(filingId: string): Promise<{
  ready: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Fetch filing with company and org details
  const { data: filing, error: filingError } = await supabase
    .from('filings')
    .select(`
      *,
      companies(
        id,
        company_number,
        company_name,
        companies_house_auth_code
      )
    `)
    .eq('id', filingId)
    .single();

  if (filingError || !filing) {
    errors.push('Filing not found');
    return { ready: false, errors };
  }

  // Check company has CH number
  const company = (filing as any).companies;
  if (!company?.company_number) {
    errors.push('Company number is not set');
  }

  // Check company has auth code
  if (!company?.companies_house_auth_code) {
    errors.push('Company authentication code is not set');
  }

  // Check filing status is appropriate
  if (!['draft', 'ready_to_file', 'approved'].includes(filing.status)) {
    errors.push(`Filing cannot be submitted in status: ${filing.status}`);
  }

  // Check presenter details are configured
  const { data: orgCH } = await supabase
    .from('organization_integrations_companies_house')
    .select('presenter_id, presenter_email, presenter_name')
    .eq('organization_id', filing.organization_id)
    .maybeSingle();

  if (!orgCH?.presenter_id) {
    errors.push('Presenter ID is not configured in Settings');
  }

  if (!orgCH?.presenter_email) {
    errors.push('Presenter email is not configured in Settings');
  }

  return { ready: errors.length === 0, errors };
}

/**
 * Get filing status text for display
 */
export function getFilingStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    draft: 'Draft',
    in_progress: 'In Progress',
    ready_to_file: 'Ready to File',
    awaiting_approval: 'Awaiting Approval',
    approved: 'Approved',
    submitted: 'Submitted to CH',
    accepted: 'Accepted by CH',
    rejected: 'Rejected by CH',
    filed: 'Filed',
    error: 'Error',
  };
  return statusMap[status] || status;
}

/**
 * Get filing environment badge color
 */
export function getEnvironmentBadgeVariant(environment: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  return environment === 'production' ? 'default' : 'secondary';
}
