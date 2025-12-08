// Role definitions
export type AppRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

// Permission names
export type PermissionName =
  | 'can_manage_practice_settings'
  | 'can_manage_integrations'
  | 'can_manage_automation_rules'
  | 'can_finalize_workpapers'
  | 'can_approve_filings'
  | 'can_view_all_jobs'
  | 'can_manage_billing'
  | 'can_manage_team'
  | 'can_create_jobs'
  | 'can_view_sensitive_data'
  | 'can_delete_records';

// Permission to roles mapping
export const PERMISSIONS: Record<PermissionName, AppRole[]> = {
  can_manage_practice_settings: ['owner', 'admin'],
  can_manage_integrations: ['owner', 'admin'],
  can_manage_automation_rules: ['owner', 'admin', 'manager'],
  can_finalize_workpapers: ['owner', 'admin', 'manager'],
  can_approve_filings: ['owner', 'admin', 'manager'],
  can_view_all_jobs: ['owner', 'admin', 'manager', 'staff'],
  can_manage_billing: ['owner'],
  can_manage_team: ['owner', 'admin'],
  can_create_jobs: ['owner', 'admin', 'manager', 'staff'],
  can_view_sensitive_data: ['owner', 'admin', 'manager'],
  can_delete_records: ['owner', 'admin'],
};

// Role hierarchy (higher index = more permissions)
export const ROLE_HIERARCHY: AppRole[] = ['viewer', 'staff', 'manager', 'admin', 'owner'];

// Check if a role has a specific permission
export function roleHasPermission(role: string | null | undefined, permission: PermissionName): boolean {
  if (!role) return false;
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles.includes(role as AppRole);
}

// Check if role A is equal to or higher than role B in hierarchy
export function roleIsAtLeast(userRole: string | null | undefined, requiredRole: AppRole): boolean {
  if (!userRole) return false;
  const userIndex = ROLE_HIERARCHY.indexOf(userRole as AppRole);
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);
  return userIndex >= requiredIndex;
}

// Get human-readable role label
export function getRoleLabel(role: AppRole): string {
  const labels: Record<AppRole, string> = {
    owner: 'Owner',
    admin: 'Administrator',
    manager: 'Manager',
    staff: 'Staff',
    viewer: 'Viewer',
  };
  return labels[role] || role;
}
