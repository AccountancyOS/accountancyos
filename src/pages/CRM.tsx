import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useToast } from "@/hooks/use-toast";
import { Plus, Phone, Mail, User, TrendingUp, Loader2, GripVertical, Trash2, Calendar, Building2, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { format } from "date-fns";
import {
  CLIENT_TYPES,
  CLIENT_TYPE_LABELS,
  isCompanyBasedType,
  type ClientType,
} from "@/lib/client-types";

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
  lead_type: ClientType;
  ch_company_profile: any | null;
}

// Phase 2.1: Removed "qualified" stage - now 5-stage pipeline
const pipelineStages = [
  { value: "new", label: "New", color: "bg-blue-500" },
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

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [editFormData, setEditFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    source: "website",
    estimated_monthly_value: "",
    notes: "",
    lead_type: "other" as ClientType,
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    lead_type: "other" as ClientType,
    company_name: "",
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
      setLeads((data || []).map(lead => ({
        ...lead,
        lead_type: (lead.lead_type || 'other') as ClientType,
        ch_company_profile: lead.ch_company_profile,
      })));
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
      const isCompanyLead = isCompanyBasedType(formData.lead_type);
      
      const { error } = await supabase.from("leads").insert({
        organization_id: organization!.id,
        first_name: isCompanyLead ? formData.company_name : formData.first_name,
        last_name: isCompanyLead ? "" : formData.last_name,
        email: formData.email,
        phone: formData.phone || null,
        source: formData.source,
        estimated_monthly_value: formData.estimated_monthly_value
          ? parseFloat(formData.estimated_monthly_value)
          : null,
        notes: formData.notes || null,
        pipeline_stage: "new",
        lead_type: formData.lead_type,
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
        lead_type: "other",
        company_name: "",
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
      // Build update data with stage timestamp
      const updateData: Record<string, any> = { pipeline_stage: newStage };
      
      // Phase 2.3: Add timestamp for stage changes
      if (newStage === 'proposal_sent') {
        updateData.proposal_sent_at = new Date().toISOString();
      } else if (newStage === 'chasing') {
        updateData.chasing_started_at = new Date().toISOString();
      } else if (newStage === 'won') {
        updateData.won_at = new Date().toISOString();
      } else if (newStage === 'lost') {
        updateData.lost_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", leadId);

      if (error) throw error;

      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === leadId ? { ...lead, pipeline_stage: newStage } : lead
        )
      );

      toast({
        title: "Stage updated",
        description: "Lead stage has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error updating stage",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    setEditFormData({
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      phone: lead.phone || "",
      source: lead.source || "website",
      estimated_monthly_value: lead.estimated_monthly_value?.toString() || "",
      notes: lead.notes || "",
      lead_type: lead.lead_type || "other",
    });
    setEditDialogOpen(true);
  };

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    setIsUpdating(true);

    try {
      const { error } = await supabase
        .from("leads")
        .update({
          first_name: editFormData.first_name,
          last_name: editFormData.last_name,
          email: editFormData.email,
          phone: editFormData.phone || null,
          source: editFormData.source,
          estimated_monthly_value: editFormData.estimated_monthly_value
            ? parseFloat(editFormData.estimated_monthly_value)
            : null,
          notes: editFormData.notes || null,
          lead_type: editFormData.lead_type,
        })
        .eq("id", selectedLead.id);

      if (error) throw error;

      toast({
        title: "Lead updated",
        description: "Lead has been updated successfully.",
      });

      setEditDialogOpen(false);
      loadLeads();
    } catch (error: any) {
      toast({
        title: "Error updating lead",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteLead = async () => {
    if (!selectedLead) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from("leads")
        .delete()
        .eq("id", selectedLead.id);

      if (error) throw error;

      toast({
        title: "Lead deleted",
        description: "Lead has been removed.",
      });

      setEditDialogOpen(false);
      loadLeads();
    } catch (error: any) {
      toast({
        title: "Error deleting lead",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
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

  const getStageInfo = (stage: string) => {
    return pipelineStages.find((s) => s.value === stage);
  };

  const isCompanyLeadType = isCompanyBasedType(formData.lead_type);

  // Pipeline skeleton loading state
  const PipelineSkeleton = () => (
    <div className="flex gap-4 overflow-x-auto pb-4 animate-fade-in">
      {pipelineStages.map((stage) => (
        <div key={stage.value} className="flex-shrink-0 w-72">
          <Card>
            <CardHeader className="pb-3">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-16 mt-1" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-3">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20 mt-2" />
                </Card>
              ))}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex-1 overflow-auto">
          <div className="p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <Skeleton className="h-8 w-48 mb-2" />
                <Skeleton className="h-4 w-72" />
              </div>
              <Skeleton className="h-10 w-28" />
            </div>
            <PipelineSkeleton />
          </div>
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
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Lead</DialogTitle>
                  <DialogDescription>
                    Enter the details of the potential client
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Lead Type Selector */}
                  <div className="space-y-2">
                    <Label htmlFor="lead_type">Lead Type</Label>
                    <Select
                      value={formData.lead_type}
                      onValueChange={(value) =>
                        setFormData({ ...formData, lead_type: value as ClientType })
                      }
                      disabled={submitting}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select lead type" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIENT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {CLIENT_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Conditional fields based on lead type */}
                  {isCompanyLeadType ? (
                    <div className="space-y-2">
                      <Label htmlFor="company_name">Company Name *</Label>
                      <div className="flex gap-2">
                        <Input
                          id="company_name"
                          value={formData.company_name}
                          onChange={(e) =>
                            setFormData({ ...formData, company_name: e.target.value })
                          }
                          required
                          disabled={submitting}
                          placeholder="Enter company name"
                        />
                        {(formData.lead_type === 'limited_company' || formData.lead_type === 'llp') && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={submitting}
                            title="Lookup on Companies House"
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {(formData.lead_type === 'limited_company' || formData.lead_type === 'llp') && (
                        <p className="text-xs text-muted-foreground">
                          Click search to lookup company details from Companies House
                        </p>
                      )}
                    </div>
                  ) : (
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
                  )}

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

            <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-5">
              {pipelineStages.map((stage) => (
                <DroppableColumn
                  key={stage.value}
                  id={stage.value}
                  stage={stage}
                  leads={getLeadsByStage(stage.value)}
                  onUpdateStage={updateStage}
                  onLeadClick={handleLeadClick}
                />
              ))}
            </div>

            <DragOverlay>
              {activeLead ? <LeadCard lead={activeLead} isDragging /> : null}
            </DragOverlay>
          </DndContext>

          {/* Edit Lead Dialog */}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Lead Details</DialogTitle>
                <DialogDescription>
                  View and edit lead information
                </DialogDescription>
              </DialogHeader>

              {selectedLead && (
                <>
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <Badge className={getStageInfo(selectedLead.pipeline_stage)?.color}>
                      {getStageInfo(selectedLead.pipeline_stage)?.label}
                    </Badge>
                    <Badge variant="outline">
                      {CLIENT_TYPE_LABELS[selectedLead.lead_type] || 'Other'}
                    </Badge>
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Created {format(new Date(selectedLead.created_at), "dd MMM yyyy")}
                    </span>
                  </div>

                  <form onSubmit={handleUpdateLead} className="space-y-4">
                    {/* Lead Type */}
                    <div className="space-y-2">
                      <Label htmlFor="edit_lead_type">Lead Type</Label>
                      <Select
                        value={editFormData.lead_type}
                        onValueChange={(value) =>
                          setEditFormData({ ...editFormData, lead_type: value as ClientType })
                        }
                        disabled={isUpdating}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLIENT_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {CLIENT_TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit_first_name">
                          {isCompanyBasedType(editFormData.lead_type) ? "Company Name" : "First Name"} *
                        </Label>
                        <Input
                          id="edit_first_name"
                          value={editFormData.first_name}
                          onChange={(e) =>
                            setEditFormData({ ...editFormData, first_name: e.target.value })
                          }
                          required
                          disabled={isUpdating}
                        />
                      </div>
                      {!isCompanyBasedType(editFormData.lead_type) && (
                        <div className="space-y-2">
                          <Label htmlFor="edit_last_name">Last Name *</Label>
                          <Input
                            id="edit_last_name"
                            value={editFormData.last_name}
                            onChange={(e) =>
                              setEditFormData({ ...editFormData, last_name: e.target.value })
                            }
                            required
                            disabled={isUpdating}
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit_email">Email *</Label>
                      <Input
                        id="edit_email"
                        type="email"
                        value={editFormData.email}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, email: e.target.value })
                        }
                        required
                        disabled={isUpdating}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit_phone">Phone</Label>
                      <Input
                        id="edit_phone"
                        type="tel"
                        value={editFormData.phone}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, phone: e.target.value })
                        }
                        disabled={isUpdating}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit_source">Source</Label>
                        <Select
                          value={editFormData.source}
                          onValueChange={(value) =>
                            setEditFormData({ ...editFormData, source: value })
                          }
                          disabled={isUpdating}
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
                        <Label htmlFor="edit_estimated_monthly_value">
                          Est. Monthly Value (£)
                        </Label>
                        <Input
                          id="edit_estimated_monthly_value"
                          type="number"
                          step="0.01"
                          value={editFormData.estimated_monthly_value}
                          onChange={(e) =>
                            setEditFormData({
                              ...editFormData,
                              estimated_monthly_value: e.target.value,
                            })
                          }
                          disabled={isUpdating}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit_notes">Notes</Label>
                      <Textarea
                        id="edit_notes"
                        value={editFormData.notes}
                        onChange={(e) =>
                          setEditFormData({ ...editFormData, notes: e.target.value })
                        }
                        rows={3}
                        disabled={isUpdating}
                      />
                    </div>

                    <DialogFooter className="flex justify-between sm:justify-between">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="destructive" disabled={isDeleting}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Lead
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete {selectedLead.first_name} {selectedLead.last_name} from your CRM.
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleDeleteLead}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {isDeleting ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Deleting...
                                </>
                              ) : (
                                "Delete"
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditDialogOpen(false)}
                          disabled={isUpdating}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isUpdating}>
                          {isUpdating ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save Changes"
                          )}
                        </Button>
                      </div>
                    </DialogFooter>
                  </form>
                </>
              )}
            </DialogContent>
          </Dialog>
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
  onLeadClick: (lead: Lead) => void;
}

const DroppableColumn = ({ id, stage, leads, onUpdateStage, onLeadClick }: DroppableColumnProps) => {
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
          <DraggableLead key={lead.id} lead={lead} onUpdateStage={onUpdateStage} onLeadClick={onLeadClick} />
        ))}
      </CardContent>
    </Card>
  );
};

interface DraggableLeadProps {
  lead: Lead;
  onUpdateStage: (leadId: string, stage: string) => void;
  onLeadClick: (lead: Lead) => void;
}

const DraggableLead = ({ lead, onUpdateStage, onLeadClick }: DraggableLeadProps) => {
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
      <LeadCard lead={lead} onUpdateStage={onUpdateStage} onLeadClick={onLeadClick} dragListeners={listeners} dragAttributes={attributes} />
    </div>
  );
};

interface LeadCardProps {
  lead: Lead;
  onUpdateStage?: (leadId: string, stage: string) => void;
  onLeadClick?: (lead: Lead) => void;
  isDragging?: boolean;
  dragListeners?: any;
  dragAttributes?: any;
}

const LeadCard = ({ lead, onUpdateStage, onLeadClick, isDragging, dragListeners, dragAttributes }: LeadCardProps) => {
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't open dialog if clicking on drag handle or select
    const target = e.target as HTMLElement;
    if (target.closest('[data-drag-handle]') || target.closest('[role="combobox"]')) {
      return;
    }
    onLeadClick?.(lead);
  };

  const isCompanyLead = isCompanyBasedType(lead.lead_type);

  return (
    <Card 
      className={`p-4 hover:shadow-md transition-shadow cursor-pointer ${isDragging ? "shadow-lg" : ""}`}
      onClick={handleCardClick}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <div {...dragListeners} {...dragAttributes} data-drag-handle className="cursor-grab active:cursor-grabbing">
              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </div>
            {isCompanyLead ? (
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <p className="text-sm font-medium">
              {lead.first_name} {lead.last_name}
            </p>
          </div>
        </div>
        {lead.lead_type && lead.lead_type !== 'other' && (
          <Badge variant="outline" className="text-xs">
            {CLIENT_TYPE_LABELS[lead.lead_type]}
          </Badge>
        )}
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
