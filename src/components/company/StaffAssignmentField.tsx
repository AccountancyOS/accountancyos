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
  companyId: string;
  field: "partner_in_charge" | "staff_in_charge";
  currentValue: string | null;
  label: string;
}

export function StaffAssignmentField({ companyId, field, currentValue, label }: StaffAssignmentFieldProps) {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  const { data: orgUsers } = useQuery({
    queryKey: ["org-users", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("organization_users")
        .select("user_id, role, profiles(first_name, last_name, email)")
        .eq("organization_id", organization.id);
      if (error) throw error;
      return (data || []).map((u: any) => ({
        id: u.user_id,
        name: u.profiles?.first_name && u.profiles?.last_name
          ? `${u.profiles.first_name} ${u.profiles.last_name}`
          : u.profiles?.email || u.user_id,
        role: u.role,
      }));
    },
    enabled: !!organization?.id,
  });

  const mutation = useMutation({
    mutationFn: async (userId: string | null) => {
      const { error } = await supabase
        .from("companies")
        .update({ [field]: userId })
        .eq("id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      toast.success(`${label} updated`);
    },
    onError: (error: any) => {
      toast.error(error.message || `Failed to update ${label}`);
    },
  });

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
          {orgUsers?.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.name} ({user.role})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
