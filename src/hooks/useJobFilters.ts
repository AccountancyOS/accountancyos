import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useOrganization } from '@/lib/organization-context';
import { 
  JobFilters, 
  SavedView,
  getFilteredJobs, 
  getSavedViews,
  createSavedView,
  deleteSavedView,
  getDefaultSavedView
} from '@/lib/jobs-filter-service';

export function useJobFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { organization } = useOrganization();
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [isLoadingViews, setIsLoadingViews] = useState(true);

  // Parse filters from URL
  const filters: JobFilters = useMemo(() => ({
    status: searchParams.get('status')?.split(',').filter(Boolean) || [],
    assignee: searchParams.get('assignee') || undefined,
    due: searchParams.get('due') as JobFilters['due'] || undefined,
    dueStart: searchParams.get('dueStart') || undefined,
    dueEnd: searchParams.get('dueEnd') || undefined,
    serviceType: searchParams.get('serviceType')?.split(',').filter(Boolean) || [],
    clientId: searchParams.get('clientId') || undefined,
    companyId: searchParams.get('companyId') || undefined,
    search: searchParams.get('search') || undefined,
  }), [searchParams]);

  // Update URL with filters
  const setFilters = useCallback((newFilters: JobFilters) => {
    const params = new URLSearchParams();
    
    if (newFilters.status?.length) {
      params.set('status', newFilters.status.join(','));
    }
    if (newFilters.assignee) {
      params.set('assignee', newFilters.assignee);
    }
    if (newFilters.due) {
      params.set('due', newFilters.due);
    }
    if (newFilters.dueStart) {
      params.set('dueStart', newFilters.dueStart);
    }
    if (newFilters.dueEnd) {
      params.set('dueEnd', newFilters.dueEnd);
    }
    if (newFilters.serviceType?.length) {
      params.set('serviceType', newFilters.serviceType.join(','));
    }
    if (newFilters.clientId) {
      params.set('clientId', newFilters.clientId);
    }
    if (newFilters.companyId) {
      params.set('companyId', newFilters.companyId);
    }
    if (newFilters.search) {
      params.set('search', newFilters.search);
    }
    
    setSearchParams(params);
  }, [setSearchParams]);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  // Quick filter presets
  const applyQuickFilter = useCallback((preset: string) => {
    switch (preset) {
      case 'my_jobs':
        setFilters({ assignee: 'me' });
        break;
      case 'overdue':
        setFilters({ due: 'overdue' });
        break;
      case 'due_this_week':
        setFilters({ due: 'this_week' });
        break;
      case 'records_requested':
        setFilters({ status: ['records_requested'] });
        break;
      case 'client_queries':
        setFilters({ status: ['client_queries'] });
        break;
      case 'accountant_review':
        setFilters({ status: ['accountant_review'] });
        break;
      case 'unassigned':
        setFilters({ assignee: 'unassigned' });
        break;
      default:
        clearFilters();
    }
  }, [setFilters, clearFilters]);

  // Load saved views
  useEffect(() => {
    async function loadViews() {
      if (!organization?.id || !user?.id) return;
      
      setIsLoadingViews(true);
      const views = await getSavedViews(organization.id, user.id, 'jobs');
      setSavedViews(views);
      setIsLoadingViews(false);
    }
    
    loadViews();
  }, [organization?.id, user?.id]);

  // Apply saved view
  const applySavedView = useCallback((view: SavedView) => {
    setFilters(view.filters);
  }, [setFilters]);

  // Save current view
  const saveCurrentView = useCallback(async (
    viewName: string, 
    isDefault: boolean = false
  ): Promise<boolean> => {
    if (!organization?.id || !user?.id) return false;
    
    const view = await createSavedView(
      organization.id,
      user.id,
      viewName,
      filters,
      'jobs',
      isDefault
    );
    
    if (view) {
      setSavedViews(prev => [...prev, view]);
      return true;
    }
    return false;
  }, [organization?.id, user?.id, filters]);

  // Delete saved view
  const removeSavedView = useCallback(async (viewId: string): Promise<boolean> => {
    const success = await deleteSavedView(viewId);
    if (success) {
      setSavedViews(prev => prev.filter(v => v.id !== viewId));
    }
    return success;
  }, []);

  // Load default view on mount
  useEffect(() => {
    async function loadDefaultView() {
      if (!organization?.id || !user?.id) return;
      
      // Only apply default if no filters in URL
      if (searchParams.toString()) return;
      
      const defaultView = await getDefaultSavedView(organization.id, user.id, 'jobs');
      if (defaultView) {
        setFilters(defaultView.filters);
      }
    }
    
    loadDefaultView();
  }, [organization?.id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.status?.length ||
      filters.assignee ||
      filters.due ||
      filters.serviceType?.length ||
      filters.clientId ||
      filters.companyId ||
      filters.search
    );
  }, [filters]);

  return {
    filters,
    setFilters,
    clearFilters,
    applyQuickFilter,
    savedViews,
    isLoadingViews,
    applySavedView,
    saveCurrentView,
    removeSavedView,
    hasActiveFilters
  };
}
