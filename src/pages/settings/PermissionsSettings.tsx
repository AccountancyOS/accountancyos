/**
 * Permissions Settings Page
 * Allows owners and admins to view roles and manage team member permissions
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Shield, Users, Check, X, ChevronLeft, Crown, ShieldCheck, Briefcase, Eye, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { PermissionGuard } from "@/components/ui/permission-guard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { updateUserRoleSafe } from "@/lib/permission-service";

type AppRole = "owner" | "admin" | "manager" | "staff" | "viewer";

const ROLE_CONFIG: Record<AppRole, { label: string; icon: React.ElementType; color: string }> = {
  owner: { label: "Owner", icon: Crown, color: "bg-amber-500" },
  admin: { label: "Administrator", icon: ShieldCheck, color: "bg-purple-500" },
  manager: { label: "Manager", icon: Briefcase, color: "bg-blue-500" },
  staff: { label: "Staff", icon: User, color: "bg-green-500" },
  viewer: { label: "Viewer", icon: Eye, color: "bg-gray-500" },
};

const PERMISSIONS_MATRIX: { permission: string; label: string; roles: AppRole[] }[] = [
  { permission: "can_manage_practice_settings", label: "Manage Practice Settings", roles: ["owner", "admin"] },
  { permission: "can_manage_integrations", label: "Manage Integrations", roles: ["owner", "admin"] },
  { permission: "can_manage_billing", label: "Manage Billing", roles: ["owner"] },
  { permission: "can_manage_team", label: "Manage Team & Roles", roles: ["owner", "admin"] },
  { permission: "can_manage_automation_rules", label: "Manage Automation Rules", roles: ["owner", "admin", "manager"] },
  { permission: "can_manage_templates", label: "Manage Templates", roles: ["owner", "admin", "manager"] },
  { permission: "can_finalize_workpapers", label: "Finalize Workpapers", roles: ["owner", "admin", "manager"] },
  { permission: "can_approve_filings", label: "Approve Filings", roles: ["owner", "admin", "manager"] },
  { permission: "can_submit_filings", label: "Submit Filings", roles: ["owner", "admin", "manager"] },
  { permission: "can_view_sensitive_data", label: "View Sensitive Data", roles: ["owner", "admin", "manager"] },
  { permission: "can_delete_records", label: "Delete Records", roles: ["owner", "admin"] },
  { permission: "can_create_jobs", label: "Create Jobs", roles: ["owner", "admin", "manager", "staff"] },
  { permission: "can_view_all_jobs", label: "View All Jobs", roles: ["owner", "admin", "manager", "staff"] },
];

export default function PermissionsSettings() {
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Fetch team members
  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ["team-members", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data, error } = await supabase
        .from("organization_users")
        .select(`
          id,
          user_id,
          role,
          created_at,
          profiles:user_id (
            id,
            email,
            first_name,
            last_name
          )
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!organization?.id,
  });

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      if (!organization?.id) throw new Error("No organization");
      setUpdatingUserId(userId);
      return updateUserRoleSafe(userId, organization.id, newRole);
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Role updated to ${result.new_role}`);
        queryClient.invalidateQueries({ queryKey: ["team-members"] });
      } else {
        toast.error(result.error || "Failed to update role");
      }
    },
    onError: (error: Error) => {
      toast.error(`Failed to update role: ${error.message}`);
    },
    onSettled: () => {
      setUpdatingUserId(null);
    },
  });

  const getRoleIcon = (role: string) => {
    const config = ROLE_CONFIG[role as AppRole];
    if (!config) return <User className="h-4 w-4" />;
    const Icon = config.icon;
    return <Icon className="h-4 w-4" />;
  };

  const getRoleBadge = (role: string) => {
    const config = ROLE_CONFIG[role as AppRole];
    if (!config) return <Badge variant="secondary">{role}</Badge>;
    return (
      <Badge className={`${config.color} text-white gap-1`}>
        {getRoleIcon(role)}
        {config.label}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <PermissionGuard permission="can_manage_team" title="Team Permissions">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/settings">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Team Permissions</h1>
              <p className="text-muted-foreground">
                Manage roles and permissions for team members
              </p>
            </div>
          </div>

          {/* Team Members Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
              <CardDescription>
                Assign roles to control what team members can access
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                  Loading team members...
                </div>
              ) : !teamMembers || teamMembers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No team members found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Current Role</TableHead>
                      <TableHead>Change Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamMembers.map((member) => {
                      const profile = member.profiles as { email?: string; first_name?: string; last_name?: string } | null;
                      const name = profile?.first_name && profile?.last_name
                        ? `${profile.first_name} ${profile.last_name}`
                        : profile?.email || "Unknown";
                      const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
                      
                      return (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>{initials}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{name}</p>
                                <p className="text-sm text-muted-foreground">{profile?.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getRoleBadge(member.role)}</TableCell>
                          <TableCell>
                            <Select
                              value={member.role}
                              onValueChange={(value) =>
                                updateRoleMutation.mutate({ userId: member.user_id, newRole: value })
                              }
                              disabled={updatingUserId === member.user_id}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(ROLE_CONFIG).map(([role, config]) => (
                                  <SelectItem key={role} value={role}>
                                    <div className="flex items-center gap-2">
                                      <config.icon className="h-4 w-4" />
                                      {config.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Permissions Matrix Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Permissions Matrix
              </CardTitle>
              <CardDescription>
                Overview of what each role can do
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">Permission</TableHead>
                      {Object.entries(ROLE_CONFIG).map(([role, config]) => (
                        <TableHead key={role} className="text-center w-24">
                          <div className="flex flex-col items-center gap-1">
                            <config.icon className="h-4 w-4" />
                            <span className="text-xs">{config.label}</span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PERMISSIONS_MATRIX.map((perm) => (
                      <TableRow key={perm.permission}>
                        <TableCell className="font-medium">{perm.label}</TableCell>
                        {(Object.keys(ROLE_CONFIG) as AppRole[]).map((role) => (
                          <TableCell key={role} className="text-center">
                            {perm.roles.includes(role) ? (
                              <Check className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Role Descriptions */}
          <Card>
            <CardHeader>
              <CardTitle>Role Descriptions</CardTitle>
              <CardDescription>
                Understanding what each role means
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(ROLE_CONFIG).map(([role, config]) => (
                <div key={role} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`p-2 rounded-full ${config.color}`}>
                      <config.icon className="h-4 w-4 text-white" />
                    </div>
                    <h3 className="font-semibold">{config.label}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {role === "owner" && "Full control over the practice including billing and ownership transfer."}
                    {role === "admin" && "Complete operational access. Can manage team, settings, and all features except billing."}
                    {role === "manager" && "Can finalize workpapers, approve filings, and manage templates and automations."}
                    {role === "staff" && "Standard access to create and work on jobs. Cannot finalize or approve."}
                    {role === "viewer" && "Read-only access across the practice. Cannot make any changes."}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </PermissionGuard>
    </DashboardLayout>
  );
}
