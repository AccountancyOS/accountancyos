import { supabase } from "@/integrations/supabase/client";

export type LinkStatus = 
  | 'pending_client_approval'
  | 'pending_practice_approval'
  | 'active'
  | 'declined'
  | 'revoked_by_client'
  | 'revoked_by_practice'
  | 'switched_out';

export interface AccountantClientLink {
  id: string;
  practice_id: string;
  client_id: string | null;
  company_id: string | null;
  client_user_id: string | null;
  status: LinkStatus;
  initiated_by: 'client' | 'practice';
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  ended_at: string | null;
  decline_reason: string | null;
  notes: string | null;
  // Joined fields
  practice?: {
    id: string;
    name: string;
    firm_code: string | null;
    logo_url?: string | null;
  };
  client?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  company?: {
    id: string;
    company_name: string;
    email: string;
  };
}

// Search for practices by name, firm code, or location
export async function searchPractices(query: string) {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, firm_code, logo_url, practice_description')
    .eq('is_public_listed', true)
    .or(`name.ilike.%${query}%,firm_code.ilike.%${query}%`)
    .limit(10);

  if (error) throw error;
  return data;
}

// Get practice by firm code
export async function getPracticeByFirmCode(firmCode: string) {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, firm_code, logo_url, practice_description')
    .eq('firm_code', firmCode.toUpperCase())
    .single();

  if (error) return null;
  return data;
}

// Client initiates link to practice
export async function clientRequestLink(
  practiceId: string,
  clientId: string | null,
  companyId: string | null,
  clientUserId: string
) {
  // Check for existing active link
  const existingQuery = supabase
    .from('accountant_client_links')
    .select('id, status, practice_id')
    .eq('status', 'active');

  if (clientId) {
    existingQuery.eq('client_id', clientId);
  } else if (companyId) {
    existingQuery.eq('company_id', companyId);
  }

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    throw new Error('Already linked to an accountant. Please switch accountants instead.');
  }

  const { data, error } = await supabase
    .from('accountant_client_links')
    .insert({
      practice_id: practiceId,
      client_id: clientId,
      company_id: companyId,
      client_user_id: clientUserId,
      status: 'pending_practice_approval',
      initiated_by: 'client',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Practice initiates link to client
export async function practiceRequestLink(
  practiceId: string,
  clientId: string | null,
  companyId: string | null,
  clientUserId: string | null
) {
  const { data, error } = await supabase
    .from('accountant_client_links')
    .insert({
      practice_id: practiceId,
      client_id: clientId,
      company_id: companyId,
      client_user_id: clientUserId,
      status: 'pending_client_approval',
      initiated_by: 'practice',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Accept a link request (by practice or client depending on who needs to approve)
export async function acceptLinkRequest(linkId: string) {
  const { data, error } = await supabase
    .from('accountant_client_links')
    .update({
      status: 'active',
      activated_at: new Date().toISOString(),
    })
    .eq('id', linkId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Decline a link request
export async function declineLinkRequest(linkId: string, reason?: string) {
  const { data, error } = await supabase
    .from('accountant_client_links')
    .update({
      status: 'declined',
      decline_reason: reason || null,
      ended_at: new Date().toISOString(),
    })
    .eq('id', linkId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Client disconnects from accountant
export async function clientDisconnect(linkId: string) {
  const { data, error } = await supabase
    .from('accountant_client_links')
    .update({
      status: 'revoked_by_client',
      ended_at: new Date().toISOString(),
    })
    .eq('id', linkId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Practice disconnects from client
export async function practiceDisconnect(linkId: string) {
  const { data, error } = await supabase
    .from('accountant_client_links')
    .update({
      status: 'revoked_by_practice',
      ended_at: new Date().toISOString(),
    })
    .eq('id', linkId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Switch accountant - creates new pending link and marks old as switched_out when approved
export async function initiateAccountantSwitch(
  newPracticeId: string,
  clientId: string | null,
  companyId: string | null,
  clientUserId: string,
  currentLinkId: string
) {
  // Create new pending link
  const { data: newLink, error: createError } = await supabase
    .from('accountant_client_links')
    .insert({
      practice_id: newPracticeId,
      client_id: clientId,
      company_id: companyId,
      client_user_id: clientUserId,
      status: 'pending_practice_approval',
      initiated_by: 'client',
      notes: `Switch from link ${currentLinkId}`,
    })
    .select()
    .single();

  if (createError) throw createError;
  return newLink;
}

// Complete accountant switch - called when new practice accepts
export async function completeAccountantSwitch(newLinkId: string, oldLinkId: string) {
  // Mark old link as switched_out
  await supabase
    .from('accountant_client_links')
    .update({
      status: 'switched_out',
      ended_at: new Date().toISOString(),
    })
    .eq('id', oldLinkId);

  // Activate new link
  const { data, error } = await supabase
    .from('accountant_client_links')
    .update({
      status: 'active',
      activated_at: new Date().toISOString(),
    })
    .eq('id', newLinkId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get active link for a client/company
export async function getActiveLink(clientId: string | null, companyId: string | null) {
  const query = supabase
    .from('accountant_client_links')
    .select(`
      *,
      practice:organizations!practice_id(id, name, firm_code, logo_url)
    `)
    .eq('status', 'active');

  if (clientId) {
    query.eq('client_id', clientId);
  } else if (companyId) {
    query.eq('company_id', companyId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

// Get pending requests for client approval
export async function getPendingClientApprovalLinks(clientUserId: string) {
  const { data, error } = await supabase
    .from('accountant_client_links')
    .select(`
      *,
      practice:organizations!practice_id(id, name, firm_code, logo_url, practice_description)
    `)
    .eq('client_user_id', clientUserId)
    .eq('status', 'pending_client_approval');

  if (error) throw error;
  return data;
}

// Get incoming requests for practice
export async function getIncomingPracticeRequests(practiceId: string) {
  const { data, error } = await supabase
    .from('accountant_client_links')
    .select(`
      *,
      client:clients!client_id(id, first_name, last_name, email),
      company:companies!company_id(id, company_name, email)
    `)
    .eq('practice_id', practiceId)
    .eq('status', 'pending_practice_approval')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Get outgoing requests from practice
export async function getOutgoingPracticeRequests(practiceId: string) {
  const { data, error } = await supabase
    .from('accountant_client_links')
    .select(`
      *,
      client:clients!client_id(id, first_name, last_name, email),
      company:companies!company_id(id, company_name, email)
    `)
    .eq('practice_id', practiceId)
    .eq('status', 'pending_client_approval')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Get all linked clients for practice
export async function getLinkedClients(practiceId: string) {
  const { data, error } = await supabase
    .from('accountant_client_links')
    .select(`
      *,
      client:clients!client_id(id, first_name, last_name, email),
      company:companies!company_id(id, company_name, email)
    `)
    .eq('practice_id', practiceId)
    .eq('status', 'active')
    .order('activated_at', { ascending: false });

  if (error) throw error;
  return data;
}

// Create pending practice signup (for invite by email)
export async function createPendingPracticeSignup(
  accountantEmail: string,
  clientId: string | null,
  companyId: string | null,
  proposedPracticeName?: string
) {
  const { data, error } = await supabase
    .from('pending_practice_signups')
    .insert({
      accountant_email: accountantEmail,
      client_id: clientId,
      company_id: companyId,
      proposed_practice_name: proposedPracticeName,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Check if email belongs to an existing practice user
export async function checkPracticeUserByEmail(email: string) {
  // This would need a server-side function in production
  // For now, return null (email not found)
  return null;
}
