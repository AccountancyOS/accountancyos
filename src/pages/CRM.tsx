import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useToast } from "@/hooks/use-toast";
import { Plus, Phone, Mail, User, TrendingUp, Loader2, GripVertical } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useDraggable, useDroppable } from "@dnd-kit/core";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  source: string | null;
  pipeline_stage: string;
  estimated_monthly_value: number | null;
  notes: string | null;
  created_at: string;
}

const pipelineStages = [
  { value: "new", label: "New", color: "bg-blue-500" },
  { value: "qualified", label: "Qualified", color: "bg-purple-500" },
  { value: "proposal_sent", label: "Proposal Sent", color: "bg-yellow-500" },
  { value: "chasing", label: "Chasing", color: "bg-orange-500" },
  { value: "won", label: "Won", color: "bg-green-500" },
  { value: "lost", label: "Lost", color: "bg-gray-500" },
];

const CRM = () => {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    source: "website",
    estimated_monthly_value: "",
    notes: "",
  });

  useEffect(() => {
    if (organization) {
      loadLeads();
    }
  }, [organization]);

  const loadLeads = async () => {
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("organization_id", organization!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading leads",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { error } = await supabase.from("leads").insert({
        organization_id: organization!.id,
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone || null,
        source: formData.source,
        estimated_monthly_value: formData.estimated_monthly_value
          ? parseFloat(formData.estimated_monthly_value)
          : null,
        notes: formData.notes || null,
        pipeline_stage: "new",
      });

      if (error) throw error;

      toast({
        title: "Lead created",
        description: "New lead has been added successfully.",
      });

      setDialogOpen(false);
      setFormData({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        source: "website",
        estimated_monthly_value: "",
        notes: "",
      });
      loadLeads();
    } catch (error: any) {
      toast({
        title: "Error creating lead",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateStage = async (leadId: string, newStage: string) => {
    try {
      const { error } = await supabase
        .from("leads")
        .update({ pipeline_stage: newStage })
        .eq("id", leadId);

      if (error) throw error;

      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === leadId ? { ...lead, pipeline_stage: newStage } : lead
        )
      );

      toast({
        title: "Stage updated",
        description: "Lead stage has been updated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error updating stage",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getLeadsByStage = (stage: string) => {
    return leads.filter((lead) => lead.pipeline_stage === stage);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const lead = leads.find((l) => l.id === active.id);
    if (lead) {
      setActiveLead(lead);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveLead(null);

    if (!over) return;

    const leadId = active.id as string;
    const newStage = over.id as string;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.pipeline_stage === newStage) return;

    updateStage(leadId, newStage);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-semibold text-foreground mb-2">CRM Pipeline</h1>
              <p className="text-muted-foreground">
                Manage your leads and track them through the sales pipeline
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Lead
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add New Lead</DialogTitle>
                  <DialogDescription>
                    Enter the details of the potential client
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">First Name *</Label>
                      <Input
                        id="first_name"
                        value={formData.first_name}
                        onChange={(e) =>
                          setFormData({ ...formData, first_name: e.target.value })
                        }
                        required
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">Last Name *</Label>
                      <Input
                        id="last_name"
                        value={formData.last_name}
                        onChange={(e) =>
                          setFormData({ ...formData, last_name: e.target.value })
                        }
                        required
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      required
                      disabled={submitting}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      disabled={submitting}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="source">Source</Label>
                      <Select
                        value={formData.source}
                        onValueChange={(value) =>
                          setFormData({ ...formData, source: value })
                        }
                        disabled={submitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="website">Website</SelectItem>
                          <SelectItem value="referral">Referral</SelectItem>
                          <SelectItem value="ad">Advertisement</SelectItem>
                          <SelectItem value="direct">Direct</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="estimated_monthly_value">
                        Est. Monthly Value (£)
                      </Label>
                      <Input
                        id="estimated_monthly_value"
                        type="number"
                        step="0.01"
                        value={formData.estimated_monthly_value}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            estimated_monthly_value: e.target.value,
                          })
                        }
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      rows={3}
                      disabled={submitting}
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Create Lead"
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

            <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-6">
              {pipelineStages.map((stage) => (
                <DroppableColumn
                  key={stage.value}
                  id={stage.value}
                  stage={stage}
                  leads={getLeadsByStage(stage.value)}
                  onUpdateStage={updateStage}
                />
              ))}
            </div>

            <DragOverlay>
              {activeLead ? <LeadCard lead={activeLead} isDragging /> : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </DashboardLayout>
  );
};

interface DroppableColumnProps {
  id: string;
  stage: { value: string; label: string; color: string };
  leads: Lead[];
  onUpdateStage: (leadId: string, stage: string) => void;
}

const DroppableColumn = ({ id, stage, leads, onUpdateStage }: DroppableColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <Card
      ref={setNodeRef}
      className={`flex flex-col transition-colors ${
        isOver ? "ring-2 ring-primary" : ""
      }`}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className={`w-2 h-2 rounded-full ${stage.color}`} />
          {stage.label}
        </CardTitle>
        <CardDescription>{leads.length} leads</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {leads.map((lead) => (
          <DraggableLead key={lead.id} lead={lead} onUpdateStage={onUpdateStage} />
        ))}
      </CardContent>
    </Card>
  );
};

interface DraggableLeadProps {
  lead: Lead;
  onUpdateStage: (leadId: string, stage: string) => void;
}

const DraggableLead = ({ lead, onUpdateStage }: DraggableLeadProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style}>
      <LeadCard lead={lead} onUpdateStage={onUpdateStage} dragListeners={listeners} dragAttributes={attributes} />
    </div>
  );
};

interface LeadCardProps {
  lead: Lead;
  onUpdateStage?: (leadId: string, stage: string) => void;
  isDragging?: boolean;
  dragListeners?: any;
  dragAttributes?: any;
}

const LeadCard = ({ lead, onUpdateStage, isDragging, dragListeners, dragAttributes }: LeadCardProps) => {
  return (
    <Card className={`p-4 hover:shadow-md transition-shadow ${isDragging ? "shadow-lg" : ""}`}>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <div {...dragListeners} {...dragAttributes} className="cursor-grab active:cursor-grabbing">
              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </div>
            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <p className="text-sm font-medium">
              {lead.first_name} {lead.last_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mail className="h-3 w-3" />
          <span className="truncate">{lead.email}</span>
        </div>
        {lead.phone && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            <span>{lead.phone}</span>
          </div>
        )}
        {lead.estimated_monthly_value && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            <span>£{lead.estimated_monthly_value.toFixed(2)}/mo</span>
          </div>
        )}
        {!isDragging && onUpdateStage && (
          <Select
            value={lead.pipeline_stage}
            onValueChange={(value) => onUpdateStage(lead.id, value)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pipelineStages.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </Card>
  );
};

export default CRM;
