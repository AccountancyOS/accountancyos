import { supabase } from "@/integrations/supabase/client";

export interface JobFilters {
  status?: string[];
  assignee?: string | 'me' | 'unassigned';
  due?: 'today' | 'this_week' | 'this_month' | 'overdue' | 'custom';
  dueStart?: string;
  dueEnd?: string;
  serviceType?: string[];
  clientId?: string;
  companyId?: string;
  search?: string;
}

export interface SavedView {
  id: string;
  organization_id: string;
  user_id: string;
  view_name: string;
  entity_type: string;
  filters: JobFilters;
  is_default: boolean;
  created_at: string;
}

export async function getFilteredJobs(organizationId: string, filters: JobFilters, currentUserId: string) {
  // Use explicit any to break deep type instantiation chain
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('jobs')
    .select(`*, clients (id, first_name, last_name, email), companies (id, company_name, company_number)`)
    .eq('organization_id', organizationId);

  if (filters.status?.length) {
    query = query.in('status', filters.status);
  }
  
  if (filters.assignee) {
    if (filters.assignee === 'me') {
      query = query.eq('assigned_to', currentUserId);
    } else if (filters.assignee === 'unassigned') {
      query = query.is('assigned_to', null);
    } else {
      query = query.eq('assigned_to', filters.assignee);
    }
  }

  if (filters.due) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    if (filters.due === 'today') {
      query = query.eq('due_date', today);
    } else if (filters.due === 'this_week') {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
      query = query.gte('due_date', today).lte('due_date', weekEnd.toISOString().split('T')[0]);
    } else if (filters.due === 'this_month') {
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      query = query.gte('due_date', today).lte('due_date', monthEnd.toISOString().split('T')[0]);
    } else if (filters.due === 'overdue') {
      query = query.lt('due_date', today).not('status', 'eq', 'complete');
    } else if (filters.due === 'custom') {
      if (filters.dueStart) query = query.gte('due_date', filters.dueStart);
      if (filters.dueEnd) query = query.lte('due_date', filters.dueEnd);
    }
  }

  if (filters.serviceType?.length) {
    query = query.in('service_type', filters.serviceType);
  }
  if (filters.clientId) {
    query = query.eq('client_id', filters.clientId);
  }
  if (filters.companyId) {
    query = query.eq('company_id', filters.companyId);
  }
  if (filters.search?.trim()) {
    query = query.ilike('name', `%${filters.search.trim()}%`);
  }

  const { data, error } = await query.order('due_date', { ascending: true, nullsFirst: false });
  if (error) return [];
  return data || [];
}

export async function getSavedViews(organizationId: string, userId: string, entityType: string = 'jobs'): Promise<SavedView[]> {
  const { data, error } = await supabase
    .from('user_saved_views')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .order('view_name');
  if (error) return [];
  return (data || []) as unknown as SavedView[];
}

export async function createSavedView(
  organizationId: string, userId: string, viewName: string, filters: JobFilters, entityType: string = 'jobs', isDefault: boolean = false
): Promise<SavedView | null> {
  if (isDefault) {
    await supabase.from('user_saved_views').update({ is_default: false })
      .eq('organization_id', organizationId).eq('user_id', userId).eq('entity_type', entityType);
  }

  const { data, error } = await supabase
    .from('user_saved_views')
    .insert({ 
      organization_id: organizationId, 
      user_id: userId, 
      view_name: viewName, 
      entity_type: entityType, 
      filters: filters as unknown as Record<string, never>, 
      is_default: isDefault 
    })
    .select()
    .single();

  if (error) return null;
  return data as unknown as SavedView;
}

export async function updateSavedView(viewId: string, updates: { view_name?: string; filters?: JobFilters; is_default?: boolean; }): Promise<boolean> {
  const updatePayload: Record<string, unknown> = {};
  if (updates.view_name !== undefined) updatePayload.view_name = updates.view_name;
  if (updates.filters !== undefined) updatePayload.filters = updates.filters;
  if (updates.is_default !== undefined) updatePayload.is_default = updates.is_default;
  
  const { error } = await supabase.from('user_saved_views').update(updatePayload).eq('id', viewId);
  return !error;
}

export async function deleteSavedView(viewId: string): Promise<boolean> {
  const { error } = await supabase.from('user_saved_views').delete().eq('id', viewId);
  return !error;
}

export async function getDefaultSavedView(organizationId: string, userId: string, entityType: string = 'jobs'): Promise<SavedView | null> {
  const { data, error } = await supabase
    .from('user_saved_views')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('is_default', true)
    .single();
  if (error) return null;
  return data as unknown as SavedView;
}
