import { useMemo } from 'react';
import { useOrganization } from '@/lib/organization-context';
import { 
  AppRole, 
  PermissionName, 
  roleHasPermission, 
  roleIsAtLeast,
  PERMISSIONS 
} from '@/lib/permissions';

/**
 * Hook to get the current user's role in the organization
 */
export function useCurrentUserRole(): AppRole | null {
  const { role } = useOrganization();
  return (role as AppRole) || null;
}

/**
 * Hook to check if the current user has a specific permission
 */
export function usePermission(permission: PermissionName): boolean {
  const role = useCurrentUserRole();
  return useMemo(() => roleHasPermission(role, permission), [role, permission]);
}

/**
 * Hook to check multiple permissions at once
 */
export function usePermissions(permissions: PermissionName[]): Record<PermissionName, boolean> {
  const role = useCurrentUserRole();
  
  return useMemo(() => {
    const result: Partial<Record<PermissionName, boolean>> = {};
    for (const permission of permissions) {
      result[permission] = roleHasPermission(role, permission);
    }
    return result as Record<PermissionName, boolean>;
  }, [role, permissions]);
}

/**
 * Hook to check if the current user's role meets a minimum requirement
 */
export function useRoleIsAtLeast(requiredRole: AppRole): boolean {
  const role = useCurrentUserRole();
  return useMemo(() => roleIsAtLeast(role, requiredRole), [role, requiredRole]);
}

/**
 * Hook to get all permissions for the current user
 */
export function useAllPermissions(): Record<PermissionName, boolean> {
  const role = useCurrentUserRole();
  
  return useMemo(() => {
    const result: Record<PermissionName, boolean> = {} as Record<PermissionName, boolean>;
    for (const permission of Object.keys(PERMISSIONS) as PermissionName[]) {
      result[permission] = roleHasPermission(role, permission);
    }
    return result;
  }, [role]);
}

/**
 * Hook to check if user can finalize workpapers (server-side backed)
 */
export function useCanFinalize(): boolean {
  return usePermission('can_finalize_workpapers');
}

/**
 * Hook to check if user can approve filings (server-side backed)
 */
export function useCanApproveFilings(): boolean {
  return usePermission('can_approve_filings');
}

/**
 * Hook to check if user can submit filings (server-side backed)
 */
export function useCanSubmitFilings(): boolean {
  return usePermission('can_submit_filings');
}

/**
 * Hook to check if user can manage templates
 */
export function useCanManageTemplates(): boolean {
  return usePermission('can_manage_templates');
}
