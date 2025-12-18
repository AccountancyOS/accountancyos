/**
 * Role-based permission system for edge functions
 * Mirrors frontend permissions but for server-side enforcement
 */

export type AppRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

export type Permission =
  // Organization
  | 'org.read'
  | 'org.write'
  | 'org.delete'
  // Billing
  | 'billing.read'
  | 'billing.admin'
  // Clients
  | 'clients.read'
  | 'clients.write'
  | 'clients.delete'
  // Companies
  | 'companies.read'
  | 'companies.write'
  | 'companies.delete'
  // Jobs
  | 'jobs.read'
  | 'jobs.write'
  | 'jobs.delete'
  | 'jobs.assign'
  // Bookkeeping
  | 'bookkeeping.read'
  | 'bookkeeping.write'
  | 'bookkeeping.approve'
  // Filings
  | 'filings.read'
  | 'filings.write'
  | 'filings.approve'
  | 'filings.submit'
  | 'filings.poll'
  // Templates
  | 'templates.read'
  | 'templates.write'
  | 'templates.delete'
  // Emails
  | 'emails.read'
  | 'emails.send'
  | 'emails.manage'
  // Team
  | 'team.read'
  | 'team.invite'
  | 'team.manage'
  // Automations
  | 'automations.read'
  | 'automations.write'
  // Settings
  | 'settings.read'
  | 'settings.write';

/**
 * Role to permissions mapping
 * Higher roles inherit permissions from lower roles
 */
const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  owner: [
    // All permissions
    'org.read', 'org.write', 'org.delete',
    'billing.read', 'billing.admin',
    'clients.read', 'clients.write', 'clients.delete',
    'companies.read', 'companies.write', 'companies.delete',
    'jobs.read', 'jobs.write', 'jobs.delete', 'jobs.assign',
    'bookkeeping.read', 'bookkeeping.write', 'bookkeeping.approve',
    'filings.read', 'filings.write', 'filings.approve', 'filings.submit', 'filings.poll',
    'templates.read', 'templates.write', 'templates.delete',
    'emails.read', 'emails.send', 'emails.manage',
    'team.read', 'team.invite', 'team.manage',
    'automations.read', 'automations.write',
    'settings.read', 'settings.write',
  ],
  admin: [
    'org.read', 'org.write',
    'billing.read',
    'clients.read', 'clients.write', 'clients.delete',
    'companies.read', 'companies.write', 'companies.delete',
    'jobs.read', 'jobs.write', 'jobs.delete', 'jobs.assign',
    'bookkeeping.read', 'bookkeeping.write', 'bookkeeping.approve',
    'filings.read', 'filings.write', 'filings.approve', 'filings.submit', 'filings.poll',
    'templates.read', 'templates.write', 'templates.delete',
    'emails.read', 'emails.send', 'emails.manage',
    'team.read', 'team.invite', 'team.manage',
    'automations.read', 'automations.write',
    'settings.read', 'settings.write',
  ],
  manager: [
    'org.read',
    'clients.read', 'clients.write',
    'companies.read', 'companies.write',
    'jobs.read', 'jobs.write', 'jobs.assign',
    'bookkeeping.read', 'bookkeeping.write',
    'filings.read', 'filings.write', 'filings.submit', 'filings.poll',
    'templates.read', 'templates.write',
    'emails.read', 'emails.send',
    'team.read',
    'automations.read', 'automations.write',
    'settings.read',
  ],
  staff: [
    'org.read',
    'clients.read', 'clients.write',
    'companies.read', 'companies.write',
    'jobs.read', 'jobs.write',
    'bookkeeping.read', 'bookkeeping.write',
    'filings.read', 'filings.write',
    'templates.read',
    'emails.read', 'emails.send',
    'team.read',
    'automations.read',
    'settings.read',
  ],
  viewer: [
    'org.read',
    'clients.read',
    'companies.read',
    'jobs.read',
    'bookkeeping.read',
    'filings.read',
    'templates.read',
    'emails.read',
    'team.read',
    'automations.read',
    'settings.read',
  ],
};

/**
 * Role hierarchy - higher index = more permissions
 */
export const ROLE_HIERARCHY: AppRole[] = ['viewer', 'staff', 'manager', 'admin', 'owner'];

/**
 * Check if a role has a specific permission
 */
export function roleHasPermission(role: AppRole | string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role as AppRole];
  if (!permissions) return false;
  return permissions.includes(permission);
}

/**
 * Check if a role is at least a certain level
 */
export function roleIsAtLeast(userRole: AppRole | string | null | undefined, requiredRole: AppRole): boolean {
  if (!userRole) return false;
  const userIndex = ROLE_HIERARCHY.indexOf(userRole as AppRole);
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);
  if (userIndex === -1 || requiredIndex === -1) return false;
  return userIndex >= requiredIndex;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: AppRole | string | null | undefined): Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role as AppRole] || [];
}

/**
 * Validate that a string is a valid role
 */
export function isValidRole(role: string | null | undefined): role is AppRole {
  if (!role) return false;
  return ROLE_HIERARCHY.includes(role as AppRole);
}
