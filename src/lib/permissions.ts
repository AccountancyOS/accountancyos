// Role definitions - strict 3-role model: owner > admin > staff
export type AppRole = 'owner' | 'admin' | 'staff';

// Permission names - comprehensive capability-based permissions
export type PermissionName =
  // Practice management
  | 'can_manage_practice_settings'
  | 'can_manage_integrations'
  | 'can_manage_billing'
  | 'can_manage_team'
  // Automation
  | 'can_manage_automation_rules'
  | 'can_view_automation_history'
  // Jobs & workflow
  | 'can_view_all_jobs'
  | 'can_create_jobs'
  | 'can_manage_templates'
  // Filing
  | 'can_finalize_workpapers'
  | 'can_approve_filings'
  | 'can_submit_filings'
  // Data access
  | 'can_view_sensitive_data'
  | 'can_delete_records'
  // Email
  | 'can_send_emails'
  | 'can_manage_email_queue'
  | 'can_access_shared_mailbox'
  // Bookkeeping - Invoices
  | 'can_create_invoices'
  | 'can_edit_invoices'
  | 'can_issue_invoices'
  | 'can_void_unpaid_invoices'
  | 'can_void_paid_invoices'
  // Bookkeeping - Bills
  | 'can_manage_bills'
  | 'can_approve_bills'
  | 'can_void_bills'
  // Bookkeeping - Payments & Journals
  | 'can_record_payments'
  | 'can_reverse_payments'
  | 'can_post_journals'
  | 'can_reverse_journals'
  // Bank & Reconciliation
  | 'can_manage_bank_reconciliation'
  | 'can_manage_bank_rules'
  | 'can_match_payments'
  // Period & Override
  | 'can_lock_periods'
  | 'can_override_locked_records'
  // Customers & Suppliers
  | 'can_manage_customers'
  | 'can_manage_suppliers';

// Permission to roles mapping - 3-role model
// owner: full access to everything
// admin: operational work + approvals + some management
// staff: day-to-day operational work only
export const PERMISSIONS: Record<PermissionName, AppRole[]> = {
  // Practice management - owner only (billing), owner+admin for settings/team
  can_manage_practice_settings: ['owner', 'admin'],
  can_manage_integrations: ['owner', 'admin'],
  can_manage_billing: ['owner'],
  can_manage_team: ['owner', 'admin'],
  
  // Automation
  can_manage_automation_rules: ['owner', 'admin'],
  can_view_automation_history: ['owner', 'admin', 'staff'],
  
  // Jobs & workflow
  can_view_all_jobs: ['owner', 'admin', 'staff'],
  can_create_jobs: ['owner', 'admin', 'staff'],
  can_manage_templates: ['owner', 'admin'],
  
  // Filing - admin+ for finalize/approve/submit
  can_finalize_workpapers: ['owner', 'admin'],
  can_approve_filings: ['owner', 'admin'],
  can_submit_filings: ['owner', 'admin'],
  
  // Data access
  can_view_sensitive_data: ['owner', 'admin'],
  can_delete_records: ['owner', 'admin'],
  
  // Email
  can_send_emails: ['owner', 'admin', 'staff'],
  can_manage_email_queue: ['owner', 'admin'],
  can_access_shared_mailbox: ['owner', 'admin', 'staff'],
  
  // Bookkeeping - Invoices
  can_create_invoices: ['owner', 'admin', 'staff'],
  can_edit_invoices: ['owner', 'admin', 'staff'],
  can_issue_invoices: ['owner', 'admin'],
  can_void_unpaid_invoices: ['owner', 'admin'],
  can_void_paid_invoices: ['owner'],
  
  // Bookkeeping - Bills
  can_manage_bills: ['owner', 'admin', 'staff'],
  can_approve_bills: ['owner', 'admin'],
  can_void_bills: ['owner', 'admin'],
  
  // Bookkeeping - Payments & Journals
  can_record_payments: ['owner', 'admin', 'staff'],
  can_reverse_payments: ['owner', 'admin'],
  can_post_journals: ['owner', 'admin'],
  can_reverse_journals: ['owner', 'admin'],
  
  // Bank & Reconciliation
  can_manage_bank_reconciliation: ['owner', 'admin'],
  can_manage_bank_rules: ['owner', 'admin'],
  can_match_payments: ['owner', 'admin', 'staff'],
  
  // Period & Override - owner only for overrides
  can_lock_periods: ['owner', 'admin'],
  can_override_locked_records: ['owner'],
  
  // Customers & Suppliers
  can_manage_customers: ['owner', 'admin', 'staff'],
  can_manage_suppliers: ['owner', 'admin', 'staff'],
};

// Role hierarchy (higher index = more permissions)
export const ROLE_HIERARCHY: AppRole[] = ['staff', 'admin', 'owner'];

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
  if (userIndex === -1 || requiredIndex === -1) return false;
  return userIndex >= requiredIndex;
}

// Get human-readable role label
export function getRoleLabel(role: AppRole): string {
  const labels: Record<AppRole, string> = {
    owner: 'Owner',
    admin: 'Admin',
    staff: 'Staff',
  };
  return labels[role] || role;
}

// Permission descriptions for UI
export const PERMISSION_DESCRIPTIONS: Record<PermissionName, string> = {
  can_manage_practice_settings: 'Modify practice settings, branding, and general configuration',
  can_manage_integrations: 'Connect and manage HMRC, Companies House, email, and bank integrations',
  can_manage_billing: 'Manage subscription, payment methods, and invoicing',
  can_manage_team: 'Invite team members and change roles',
  can_manage_automation_rules: 'Create, edit, and delete automation rules and triggers',
  can_view_automation_history: 'View automation execution history and logs',
  can_view_all_jobs: 'View all jobs across the practice',
  can_create_jobs: 'Create new jobs and tasks',
  can_manage_templates: 'Create and edit job, email, and questionnaire templates',
  can_finalize_workpapers: 'Lock and finalize workpapers for filing',
  can_approve_filings: 'Approve filings for client review and submission',
  can_submit_filings: 'Submit filings to HMRC and Companies House',
  can_view_sensitive_data: 'Access sensitive client financial data and tax positions',
  can_delete_records: 'Permanently delete clients, jobs, and other records',
  can_send_emails: 'Send emails to clients via connected mailboxes',
  can_manage_email_queue: 'View and manage the email sending queue',
  can_access_shared_mailbox: 'Access and send from the shared organization mailbox',
  can_create_invoices: 'Create new sales invoices',
  can_edit_invoices: 'Edit draft invoices',
  can_issue_invoices: 'Issue/post invoices making them immutable',
  can_void_unpaid_invoices: 'Void unpaid issued invoices (requires reason)',
  can_void_paid_invoices: 'Void paid invoices (owner override required)',
  can_manage_bills: 'Create and edit purchase bills',
  can_approve_bills: 'Approve bills for payment',
  can_void_bills: 'Void bills (requires reason)',
  can_record_payments: 'Record payments against invoices and bills',
  can_reverse_payments: 'Reverse/refund recorded payments',
  can_post_journals: 'Create and post journal entries to ledger',
  can_reverse_journals: 'Reverse posted journal entries',
  can_manage_bank_reconciliation: 'Perform bank reconciliation',
  can_manage_bank_rules: 'Create and manage bank categorization rules',
  can_match_payments: 'Match bank transactions to invoices/bills',
  can_lock_periods: 'Lock accounting periods to prevent changes',
  can_override_locked_records: 'Override locked period restrictions (with audit)',
  can_manage_customers: 'Create and edit customer records',
  can_manage_suppliers: 'Create and edit supplier records',
};
