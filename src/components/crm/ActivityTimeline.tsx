import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import {
  MessageSquare,
  Phone,
  Mail,
  CalendarDays,
  CheckSquare,
  Clock,
  Plus,
  Loader2,
  Trash2,
  Check,
} from "lucide-react";

const ACTIVITY_TYPES = [
  { value: "note", label: "Note", icon: MessageSquare, color: "text-blue-500" },
  { value: "call", label: "Call", icon: Phone, color: "text-green-500" },
  { value: "email", label: "Email", icon: Mail, color: "text-purple-500" },
  { value: "meeting", label: "Meeting", icon: CalendarDays, color: "text-orange-500" },
  { value: "task", label: "Task", icon: CheckSquare, color: "text-yellow-500" },
  { value: "follow_up", label: "Follow Up", icon: Clock, color: "text-red-500" },
] as const;

interface ActivityTimelineProps {
  leadId: string;
  clientId?: string;
}

export function ActivityTimeline({ leadId, clientId }: ActivityTimelineProps) {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState<string>("note");
  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const { data: activities, isLoading } = useQuery({
    queryKey: ["crm-activities", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_activities")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !user?.id) throw new Error("Missing context");
      const { error } = await supabase.from("crm_activities").insert({
        organization_id: organization.id,
        lead_id: leadId,
        client_id: clientId || null,
        activity_type: newType,
        subject: newSubject,
        description: newDescription || null,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-activities", leadId] });
      setShowForm(false);
      setNewSubject("");
      setNewDescription("");
      setNewType("note");
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("crm_activities")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-activities", leadId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_activities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-activities", leadId] }),
  });

  const getTypeInfo = (type: string) => ACTIVITY_TYPES.find((t) => t.value === type) || ACTIVITY_TYPES[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Activity Timeline</h4>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Log Activity
        </Button>
      </div>

      {showForm && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <Select value={newType} onValueChange={setNewType}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  <div className="flex items-center gap-2">
                    <t.icon className={`h-3.5 w-3.5 ${t.color}`} />
                    {t.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Subject"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            className="h-8"
          />
          <Textarea
            placeholder="Details (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => addMutation.mutate()}
              disabled={!newSubject.trim() || addMutation.isPending}
            >
              {addMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : activities && activities.length > 0 ? (
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />

          {activities.map((activity) => {
            const typeInfo = getTypeInfo(activity.activity_type);
            const Icon = typeInfo.icon;
            const isCompleted = !!activity.completed_at;

            return (
              <div key={activity.id} className="relative flex gap-3 pb-4 group">
                <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background ${isCompleted ? "opacity-50" : ""}`}>
                  <Icon className={`h-3.5 w-3.5 ${typeInfo.color}`} />
                </div>
                <div className={`flex-1 min-w-0 ${isCompleted ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{activity.subject}</span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1">
                      {typeInfo.label}
                    </Badge>
                    {isCompleted && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">
                        Done
                      </Badge>
                    )}
                  </div>
                  {activity.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {activity.description}
                    </p>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(activity.created_at), "dd MMM yyyy, HH:mm")}
                  </span>
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex items-start gap-1 shrink-0">
                  {!isCompleted && (activity.activity_type === "task" || activity.activity_type === "follow_up") && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => completeMutation.mutate(activity.id)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive"
                    onClick={() => deleteMutation.mutate(activity.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed rounded-lg">
          <MessageSquare className="h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No activities yet</p>
          <p className="text-xs text-muted-foreground">Log a note, call, or meeting to start tracking</p>
        </div>
      )}
    </div>
  );
}
