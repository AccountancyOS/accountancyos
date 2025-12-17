import { supabase } from "@/integrations/supabase/client";

export interface CreateCustomerResult { 
  success: boolean; 
  customer_id?: string; 
  error?: string; 
}

export interface CustomerInput {
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    postcode?: string;
    country?: string;
  };
  companyName?: string;
  vatNumber?: string;
  paymentTermsDays?: number;
  defaultCurrency?: string;
  internalNotes?: string;
}

export async function createCustomerSafe(
  organizationId: string,
  entityType: 'client' | 'company',
  entityId: string,
  input: CustomerInput
): Promise<CreateCustomerResult> {
  const { data, error } = await supabase.rpc('create_customer_safe', {
    p_organization_id: organizationId,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_name: input.name,
    p_email: input.email || null,
    p_phone: input.phone || null,
    p_billing_address: input.billingAddress ? input.billingAddress as unknown as Record<string, never> : null,
    p_company_name: input.companyName || null,
    p_vat_number: input.vatNumber || null,
    p_payment_terms_days: input.paymentTermsDays || 30,
    p_default_currency: input.defaultCurrency || 'GBP',
    p_internal_notes: input.internalNotes || null
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as CreateCustomerResult;
}
