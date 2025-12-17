// Role definitions
export type AppRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

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

// Permission to roles mapping
export const PERMISSIONS: Record<PermissionName, AppRole[]> = {
  // Practice management - owner/admin only
  can_manage_practice_settings: ['owner', 'admin'],
  can_manage_integrations: ['owner', 'admin'],
  can_manage_billing: ['owner'],
  can_manage_team: ['owner', 'admin'],
  
  // Automation - configurable (default: manager+)
  can_manage_automation_rules: ['owner', 'admin', 'manager'],
  can_view_automation_history: ['owner', 'admin', 'manager', 'staff'],
  
  // Jobs & workflow
  can_view_all_jobs: ['owner', 'admin', 'manager', 'staff'],
  can_create_jobs: ['owner', 'admin', 'manager', 'staff'],
  can_manage_templates: ['owner', 'admin', 'manager'],
  
  // Filing - manager+ for finalize/approve, submit is accountant-only
  can_finalize_workpapers: ['owner', 'admin', 'manager'],
  can_approve_filings: ['owner', 'admin', 'manager'],
  can_submit_filings: ['owner', 'admin', 'manager'],
  
  // Data access
  can_view_sensitive_data: ['owner', 'admin', 'manager'],
  can_delete_records: ['owner', 'admin'],
  
  // Email
  can_send_emails: ['owner', 'admin', 'manager', 'staff'],
  can_manage_email_queue: ['owner', 'admin', 'manager'],
  can_access_shared_mailbox: ['owner', 'admin', 'manager', 'staff'],
  
  // Bookkeeping - Invoices
  can_create_invoices: ['owner', 'admin', 'manager', 'staff'],
  can_edit_invoices: ['owner', 'admin', 'manager', 'staff'],
  can_issue_invoices: ['owner', 'admin', 'manager'], // staff needs explicit capability
  can_void_unpaid_invoices: ['owner', 'admin', 'manager'],
  can_void_paid_invoices: ['owner', 'admin'], // requires override
  
  // Bookkeeping - Bills
  can_manage_bills: ['owner', 'admin', 'manager', 'staff'],
  can_approve_bills: ['owner', 'admin', 'manager'],
  can_void_bills: ['owner', 'admin', 'manager'],
  
  // Bookkeeping - Payments & Journals
  can_record_payments: ['owner', 'admin', 'manager', 'staff'],
  can_reverse_payments: ['owner', 'admin', 'manager'],
  can_post_journals: ['owner', 'admin', 'manager'],
  can_reverse_journals: ['owner', 'admin', 'manager'],
  
  // Bank & Reconciliation
  can_manage_bank_reconciliation: ['owner', 'admin', 'manager'],
  can_manage_bank_rules: ['owner', 'admin', 'manager'],
  can_match_payments: ['owner', 'admin', 'manager', 'staff'],
  
  // Period & Override - admin+ only
  can_lock_periods: ['owner', 'admin'],
  can_override_locked_records: ['owner', 'admin'],
  
  // Customers & Suppliers
  can_manage_customers: ['owner', 'admin', 'manager', 'staff'],
  can_manage_suppliers: ['owner', 'admin', 'manager', 'staff'],
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
  // Practice management
  can_manage_practice_settings: 'Modify practice settings, branding, and general configuration',
  can_manage_integrations: 'Connect and manage HMRC, Companies House, email, and bank integrations',
  can_manage_billing: 'Manage subscription, payment methods, and invoicing',
  can_manage_team: 'Invite team members and change roles',
  
  // Automation
  can_manage_automation_rules: 'Create, edit, and delete automation rules and triggers',
  can_view_automation_history: 'View automation execution history and logs',
  
  // Jobs & workflow
  can_view_all_jobs: 'View all jobs across the practice',
  can_create_jobs: 'Create new jobs and tasks',
  can_manage_templates: 'Create and edit job, email, and questionnaire templates',
  
  // Filing
  can_finalize_workpapers: 'Lock and finalize workpapers for filing',
  can_approve_filings: 'Approve filings for client review and submission',
  can_submit_filings: 'Submit filings to HMRC and Companies House',
  
  // Data access
  can_view_sensitive_data: 'Access sensitive client financial data and tax positions',
  can_delete_records: 'Permanently delete clients, jobs, and other records',
  
  // Email
  can_send_emails: 'Send emails to clients via connected mailboxes',
  can_manage_email_queue: 'View and manage the email sending queue',
  can_access_shared_mailbox: 'Access and send from the shared organization mailbox',
  
  // Bookkeeping - Invoices
  can_create_invoices: 'Create new sales invoices',
  can_edit_invoices: 'Edit draft invoices',
  can_issue_invoices: 'Issue/post invoices making them immutable',
  can_void_unpaid_invoices: 'Void unpaid issued invoices (requires reason)',
  can_void_paid_invoices: 'Void paid invoices (admin override required)',
  
  // Bookkeeping - Bills
  can_manage_bills: 'Create and edit purchase bills',
  can_approve_bills: 'Approve bills for payment',
  can_void_bills: 'Void bills (requires reason)',
  
  // Bookkeeping - Payments & Journals
  can_record_payments: 'Record payments against invoices and bills',
  can_reverse_payments: 'Reverse/refund recorded payments',
  can_post_journals: 'Create and post journal entries to ledger',
  can_reverse_journals: 'Reverse posted journal entries',
  
  // Bank & Reconciliation
  can_manage_bank_reconciliation: 'Perform bank reconciliation',
  can_manage_bank_rules: 'Create and manage bank categorization rules',
  can_match_payments: 'Match bank transactions to invoices/bills',
  
  // Period & Override
  can_lock_periods: 'Lock accounting periods to prevent changes',
  can_override_locked_records: 'Override locked period restrictions (with audit)',
  
  // Customers & Suppliers
  can_manage_customers: 'Create and edit customer records',
  can_manage_suppliers: 'Create and edit supplier records',
};
