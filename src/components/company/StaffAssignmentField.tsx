import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface StaffAssignmentFieldProps {
  entityId: string;
  entityKind: "client" | "company";
  field: "partner_in_charge" | "staff_in_charge";
  currentValue: string | null;
  label: string;
}

// Roles that may act as Partner in Charge. Staff in Charge is open to everyone.
const PARTNER_ELIGIBLE_ROLES = new Set(["owner", "partner", "admin"]);

export function StaffAssignmentField({ entityId, entityKind, field, currentValue, label }: StaffAssignmentFieldProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const { data: orgUsers } = useQuery({
    queryKey: ["org-users", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data: members, error: membersError } = await supabase
        .from("organization_users")
        .select("user_id, role")
        .eq("organization_id", organization.id);
      if (membersError) throw membersError;
      if (!members || members.length === 0) return [];

      const userIds = members.map((m) => m.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", userIds);
      if (profilesError) throw profilesError;

      const byId = new Map((profiles || []).map((p: any) => [p.id, p]));
      return members.map((m) => {
        const p: any = byId.get(m.user_id);
        const name = p?.first_name && p?.last_name
          ? `${p.first_name} ${p.last_name}`
          : p?.email || m.user_id.slice(0, 8);
        return { id: m.user_id, name, role: m.role || "member" };
      });
    },
    enabled: !!organization?.id,
  });

  const mutation = useMutation({
    mutationFn: async (userId: string | null) => {
      const { error } = await supabase
        .from(entityKind === "company" ? "companies" : "clients")
        .update({ [field]: userId })
        .eq("id", entityId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [entityKind, entityId] });
      queryClient.invalidateQueries({ queryKey: ["client", entityId] });
      toast.success(`${label} updated`);
    },
    onError: (error: any) => {
      toast.error(error.message || `Failed to update ${label}`);
    },
  });

  const eligibleUsers = (orgUsers || []).filter((u) =>
    field === "partner_in_charge" ? PARTNER_ELIGIBLE_ROLES.has(u.role) : true,
  );

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <Select
        value={currentValue || "unassigned"}
        onValueChange={(val) => mutation.mutate(val === "unassigned" ? null : val)}
      >
        <SelectTrigger className="w-full h-8 text-sm">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {eligibleUsers.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.name} ({user.role})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
