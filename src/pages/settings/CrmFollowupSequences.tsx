import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Mail, ListChecks, Clock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  trigger_stage: string;
  is_active: boolean;
  stop_on_stages: string[];
  created_at: string;
}

interface Step {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_days: number;
  channel: "email" | "task" | "sms";
  subject: string | null;
  body: string | null;
}

const STAGE_OPTIONS = [
  { value: "new", label: "New Lead" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "chasing", label: "Chasing" },
];

export default function CrmFollowupSequences() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [activeSequence, setActiveSequence] = useState<Sequence | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStage, setNewStage] = useState("new");

  const { data: sequences = [] } = useQuery({
    queryKey: ["crm-followup-sequences", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("crm_followup_sequences")
        .select("*")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Sequence[];
    },
    enabled: !!organization?.id,
  });

  const { data: steps = [] } = useQuery({
    queryKey: ["crm-followup-steps", activeSequence?.id],
    queryFn: async () => {
      if (!activeSequence?.id) return [];
      const { data, error } = await supabase
        .from("crm_followup_steps")
        .select("*")
        .eq("sequence_id", activeSequence.id)
        .order("step_order", { ascending: true });
      if (error) throw error;
      return (data || []) as Step[];
    },
    enabled: !!activeSequence?.id,
  });

  const createSequence = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !newName.trim()) throw new Error("Name required");
      const { data, error } = await supabase
        .from("crm_followup_sequences")
        .insert({
          organization_id: organization.id,
          name: newName.trim(),
          trigger_stage: newStage,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Sequence;
    },
    onSuccess: (seq) => {
      queryClient.invalidateQueries({ queryKey: ["crm-followup-sequences"] });
      setCreateOpen(false);
      setNewName("");
      setActiveSequence(seq);
      toast.success("Sequence created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("crm_followup_sequences")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-followup-sequences"] }),
  });

  const deleteSequence = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_followup_sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-followup-sequences"] });
      setActiveSequence(null);
      toast.success("Sequence deleted");
    },
  });

  const addStep = useMutation({
    mutationFn: async () => {
      if (!activeSequence) return;
      const nextOrder = (steps[steps.length - 1]?.step_order ?? 0) + 1;
      const { error } = await supabase.from("crm_followup_steps").insert({
        sequence_id: activeSequence.id,
        step_order: nextOrder,
        delay_days: 3,
        channel: "email",
        subject: "Following Up",
        body: "Hi {{lead.first_name}},\n\nJust checking in.",
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-followup-steps"] }),
  });

  const updateStep = useMutation({
    mutationFn: async (step: Partial<Step> & { id: string }) => {
      const { error } = await supabase
        .from("crm_followup_steps")
        .update({
          delay_days: step.delay_days,
          channel: step.channel,
          subject: step.subject,
          body: step.body,
        })
        .eq("id", step.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-followup-steps"] }),
  });

  const deleteStep = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_followup_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-followup-steps"] }),
  });

  if (activeSequence) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setActiveSequence(null)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-semibold">{activeSequence.name}</h1>
              <p className="text-sm text-muted-foreground">
                Trigger: {STAGE_OPTIONS.find((s) => s.value === activeSequence.trigger_stage)?.label}
                {" - "}stops on Won or Lost
              </p>
            </div>
            <Button variant="destructive" onClick={() => deleteSequence.mutate(activeSequence.id)}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete Sequence
            </Button>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Steps</CardTitle>
                <CardDescription>
                  Each step fires sequentially after the configured delay.
                </CardDescription>
              </div>
              <Button onClick={() => addStep.mutate()}>
                <Plus className="h-4 w-4 mr-2" /> Add Step
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {steps.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No steps yet. Add one to begin.
                </p>
              ) : (
                steps.map((step, idx) => (
                  <div key={step.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">Step {idx + 1}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteStep.mutate(step.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label>Delay (days)</Label>
                        <Input
                          type="number"
                          min={0}
                          defaultValue={step.delay_days}
                          onBlur={(e) =>
                            updateStep.mutate({
                              id: step.id,
                              delay_days: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Channel</Label>
                        <Select
                          defaultValue={step.channel}
                          onValueChange={(v) =>
                            updateStep.mutate({ id: step.id, channel: v as Step["channel"] })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="task">Internal Task</SelectItem>
                            <SelectItem value="sms">SMS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Subject</Label>
                        <Input
                          defaultValue={step.subject ?? ""}
                          onBlur={(e) =>
                            updateStep.mutate({ id: step.id, subject: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Body</Label>
                      <Textarea
                        rows={4}
                        defaultValue={step.body ?? ""}
                        onBlur={(e) => updateStep.mutate({ id: step.id, body: e.target.value })}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">CRM Follow-Up Sequences</h1>
            <p className="text-sm text-muted-foreground">
              Multi-step nurture flows for leads. Each sequence stops automatically when a lead is
              marked Won or Lost.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Sequence
          </Button>
        </div>

        {sequences.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ListChecks className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No sequences yet.</p>
              <p className="text-sm mt-1">
                Create your first multi-step follow-up to nurture leads automatically.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sequences.map((seq) => (
              <Card
                key={seq.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => setActiveSequence(seq)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{seq.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3" />
                        Triggers on {STAGE_OPTIONS.find((s) => s.value === seq.trigger_stage)?.label}
                      </CardDescription>
                    </div>
                    <Switch
                      checked={seq.is_active}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={(checked) =>
                        toggleActive.mutate({ id: seq.id, is_active: checked })
                      }
                    />
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Follow-Up Sequence</DialogTitle>
              <DialogDescription>
                Name the sequence and pick the lead stage that should trigger it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New Lead Welcome Series"
                />
              </div>
              <div>
                <Label>Trigger Stage</Label>
                <Select value={newStage} onValueChange={setNewStage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => createSequence.mutate()} disabled={!newName.trim()}>
                <Mail className="h-4 w-4 mr-2" /> Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}