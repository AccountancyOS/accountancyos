/**
 * Authentication and authorization utilities for edge functions
 * Provides user validation and org context enforcement
 */

import { User } from 'https://esm.sh/@supabase/supabase-js@2.57.2';
import { getAnonClient, getAdminClient } from './supabase.ts';
import { logError, logInfo } from './logging.ts';
import { fail, ErrorCodes, ErrorDetails } from './responses.ts';
import { roleHasPermission, Permission, AppRole, isValidRole } from './permissions.ts';

export interface AuthenticatedUser {
  user: User;
  token: string;
}

export interface OrgContext {
  user: User;
  token: string;
  orgId: string;
  role: AppRole;
}

/**
 * Error thrown when authentication fails
 */
export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }

  toErrorDetails(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      retryable: false,
    };
  }
}

/**
 * Extract bearer token from request
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * Require authenticated user
 * Throws AuthError if not authenticated
 */
export async function requireUser(req: Request, traceId: string): Promise<AuthenticatedUser> {
  const token = extractBearerToken(req);
  
  if (!token) {
    logInfo(traceId, 'No bearer token provided');
    throw new AuthError(
      ErrorCodes.UNAUTHENTICATED,
      'Authorization header with bearer token required',
      401
    );
  }
  
  const supabase = getAnonClient();
  const { data, error } = await supabase.auth.getUser(token);
  
  if (error || !data.user) {
    logError(traceId, error || 'No user returned', { code: 'AUTH_FAILED' });
    throw new AuthError(
      ErrorCodes.UNAUTHENTICATED,
      'Invalid or expired authentication token',
      401
    );
  }
  
  return { user: data.user, token };
}

export interface RequireOrgContextOptions {
  /** Specific organization ID required (optional - uses user's org if not provided) */
  orgId?: string;
  /** Permission required for this operation (optional) */
  permission?: Permission;
}

/**
 * Require authenticated user with organization context
 * Verifies org membership and optionally checks permissions
 */
export async function requireOrgContext(
  req: Request,
  traceId: string,
  options?: RequireOrgContextOptions
): Promise<OrgContext> {
  // First, authenticate the user
  const { user, token } = await requireUser(req, traceId);
  
  const adminClient = getAdminClient();
  
  // Get user's organization membership
  const { data: orgUsers, error: orgError } = await adminClient
    .from('organization_users')
    .select('organization_id, role')
    .eq('user_id', user.id);
  
  if (orgError) {
    logError(traceId, orgError, { userId: user.id });
    throw new AuthError(
      ErrorCodes.INTERNAL_ERROR,
      'Failed to verify organization membership',
      500
    );
  }
  
  if (!orgUsers || orgUsers.length === 0) {
    logInfo(traceId, 'User has no organization membership', { userId: user.id });
    throw new AuthError(
      ErrorCodes.FORBIDDEN,
      'User is not a member of any organization',
      403
    );
  }
  
  // Determine which org to use
  let targetOrgId = options?.orgId;
  let membership: typeof orgUsers[0] | undefined;
  
  if (targetOrgId) {
    // Verify user is member of the requested org
    membership = orgUsers.find(ou => ou.organization_id === targetOrgId);
    if (!membership) {
      logInfo(traceId, 'User not member of requested organization', {
        userId: user.id,
        requestedOrgId: targetOrgId,
      });
      throw new AuthError(
        ErrorCodes.FORBIDDEN,
        'Not authorized for this organization',
        403
      );
    }
  } else {
    // Try to get org from request body or use first org (for single-org users)
    try {
      const body = await req.clone().json();
      if (body.organization_id || body.orgId) {
        targetOrgId = body.organization_id || body.orgId;
        membership = orgUsers.find(ou => ou.organization_id === targetOrgId);
      }
    } catch {
      // Body not JSON or no org specified
    }
    
    // If still no org, use the first (works for single-org users)
    if (!membership && orgUsers.length === 1) {
      membership = orgUsers[0];
      targetOrgId = membership.organization_id;
    } else if (!membership) {
      throw new AuthError(
        ErrorCodes.VALIDATION_ERROR,
        'Organization ID required for multi-org users',
        400
      );
    }
  }
  
  const role = membership.role;
  
  if (!isValidRole(role)) {
    logError(traceId, `Invalid role: ${role}`, { userId: user.id, orgId: targetOrgId });
    throw new AuthError(
      ErrorCodes.INTERNAL_ERROR,
      'Invalid user role configuration',
      500
    );
  }
  
  // Check permission if required
  if (options?.permission) {
    if (!roleHasPermission(role, options.permission)) {
      logInfo(traceId, 'Permission denied', {
        userId: user.id,
        orgId: targetOrgId,
        role,
        requiredPermission: options.permission,
      });
      throw new AuthError(
        ErrorCodes.INSUFFICIENT_PERMISSIONS,
        `Permission '${options.permission}' required`,
        403
      );
    }
  }
  
  logInfo(traceId, 'Org context established', {
    userId: user.id,
    orgId: targetOrgId,
    role,
  });
  
  return {
    user,
    token,
    orgId: targetOrgId!,
    role: role as AppRole,
  };
}

/**
 * Optional: Check if request has valid auth without throwing
 */
export async function getOptionalUser(req: Request): Promise<AuthenticatedUser | null> {
  try {
    const token = extractBearerToken(req);
    if (!token) return null;
    
    const supabase = getAnonClient();
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) return null;
    return { user: data.user, token };
  } catch {
    return null;
  }
}
