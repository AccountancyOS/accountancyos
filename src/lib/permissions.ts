// Role definitions
export type AppRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

// Permission names
export type PermissionName =
  | 'can_manage_practice_settings'
  | 'can_manage_integrations'
  | 'can_manage_automation_rules'
  | 'can_finalize_workpapers'
  | 'can_approve_filings'
  | 'can_submit_filings'
  | 'can_view_all_jobs'
  | 'can_manage_billing'
  | 'can_manage_team'
  | 'can_manage_templates'
  | 'can_create_jobs'
  | 'can_view_sensitive_data'
  | 'can_delete_records'
  | 'can_send_emails'
  | 'can_manage_email_queue';

// Permission to roles mapping
export const PERMISSIONS: Record<PermissionName, AppRole[]> = {
  can_manage_practice_settings: ['owner', 'admin'],
  can_manage_integrations: ['owner', 'admin'],
  can_manage_automation_rules: ['owner', 'admin', 'manager'],
  can_finalize_workpapers: ['owner', 'admin', 'manager'],
  can_approve_filings: ['owner', 'admin', 'manager'],
  can_submit_filings: ['owner', 'admin', 'manager'],
  can_view_all_jobs: ['owner', 'admin', 'manager', 'staff'],
  can_manage_billing: ['owner'],
  can_manage_team: ['owner', 'admin'],
  can_manage_templates: ['owner', 'admin', 'manager'],
  can_create_jobs: ['owner', 'admin', 'manager', 'staff'],
  can_view_sensitive_data: ['owner', 'admin', 'manager'],
  can_delete_records: ['owner', 'admin'],
  can_send_emails: ['owner', 'admin', 'manager', 'staff'],
  can_manage_email_queue: ['owner', 'admin', 'manager'],
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

// Permission descriptions for UI
export const PERMISSION_DESCRIPTIONS: Record<PermissionName, string> = {
  can_manage_practice_settings: 'Modify practice settings, branding, and general configuration',
  can_manage_integrations: 'Connect and manage HMRC, Companies House, email, and bank integrations',
  can_manage_automation_rules: 'Create, edit, and delete automation rules and triggers',
  can_finalize_workpapers: 'Lock and finalize workpapers for filing',
  can_approve_filings: 'Approve filings for client review and submission',
  can_submit_filings: 'Submit filings to HMRC and Companies House',
  can_view_all_jobs: 'View all jobs across the practice',
  can_manage_billing: 'Manage subscription, payment methods, and invoicing',
  can_manage_team: 'Invite team members and change roles',
  can_manage_templates: 'Create and edit job, email, and questionnaire templates',
  can_create_jobs: 'Create new jobs and tasks',
  can_view_sensitive_data: 'Access sensitive client financial data and tax positions',
  can_delete_records: 'Permanently delete clients, jobs, and other records',
  can_send_emails: 'Send emails to clients via connected mailboxes',
  can_manage_email_queue: 'View and manage the email sending queue',
};
