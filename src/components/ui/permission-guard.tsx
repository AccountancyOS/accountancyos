import { ReactNode } from 'react';
import { usePermission, useCurrentUserRole } from '@/hooks/usePermissions';
import { PermissionName, getRoleLabel, AppRole } from '@/lib/permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield } from 'lucide-react';

interface PermissionGuardProps {
  permission: PermissionName;
  children: ReactNode;
  fallback?: ReactNode;
  showMessage?: boolean;
  title?: string;
}

/**
 * Component that conditionally renders children based on user permission
 */
export function PermissionGuard({
  permission,
  children,
  fallback,
  showMessage = true,
  title = 'Access Restricted',
}: PermissionGuardProps): ReactNode {
  const hasPermission = usePermission(permission);
  const role = useCurrentUserRole();

  if (hasPermission) {
    return children;
  }

  if (fallback) {
    return fallback;
  }

  if (!showMessage) {
    return null;
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Shield className="h-6 w-6 text-muted-foreground" />
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>
          You don't have permission to access this feature.
          {role && (
            <span className="block mt-1">
              Your current role: <strong>{getRoleLabel(role as AppRole)}</strong>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        Contact your practice administrator if you need access.
      </CardContent>
    </Card>
  );
}

/**
 * Component that hides children entirely if user lacks permission (no message)
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionName;
  children: ReactNode;
}): ReactNode {
  const hasPermission = usePermission(permission);
  return hasPermission ? children : null;
}
