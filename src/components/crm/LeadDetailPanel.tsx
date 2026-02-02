import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { format } from "date-fns";
import {
  Calendar,
  Mail,
  Phone,
  Trash2,
  Loader2,
  FileText,
  MessageSquare,
  User,
  Building2,
  Plus,
  Send,
  Eye,
} from "lucide-react";
import {
  CLIENT_TYPES,
  CLIENT_TYPE_LABELS,
  isCompanyBasedType,
  type ClientType,
} from "@/lib/client-types";
import { useNavigate } from "react-router-dom";

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
  proposal_sent_at: string | null;
  won_at: string | null;
  lost_at: string | null;
}

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  total_amount: number;
  valid_until: string | null;
  created_at: string;
}

interface LeadDetailPanelProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadUpdated: () => void;
}

const pipelineStages = [
  { value: "new", label: "New", color: "bg-blue-500" },
  { value: "proposal_sent", label: "Proposal Sent", color: "bg-yellow-500" },
  { value: "chasing", label: "Chasing", color: "bg-orange-500" },
  { value: "won", label: "Won", color: "bg-green-500" },
  { value: "lost", label: "Lost", color: "bg-gray-500" },
];

export const LeadDetailPanel = ({
  lead,
  open,
  onOpenChange,
  onLeadUpdated,
}: LeadDetailPanelProps) => {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("overview");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    source: "website",
    estimated_monthly_value: "",
    notes: "",
    lead_type: "other" as ClientType,
  });

  // Sync form data when lead changes - Fixed: using useEffect instead of useState
  useEffect(() => {
    if (lead) {
      setFormData({
        first_name: lead.first_name,
        last_name: lead.last_name,
        email: lead.email,
        phone: lead.phone || "",
        source: lead.source || "website",
        estimated_monthly_value: lead.estimated_monthly_value?.toString() || "",
        notes: lead.notes || "",
        lead_type: lead.lead_type || "other",
      });
    }
  }, [lead]);

  // Fetch quotes for this lead
  const { data: quotes, isLoading: quotesLoading } = useQuery({
    queryKey: ["lead-quotes", lead?.id],
    queryFn: async () => {
      if (!lead?.id || !organization?.id) return [];
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Quote[];
    },
    enabled: !!lead?.id && !!organization?.id && open,
  });

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lead) return;
    setIsUpdating(true);

    try {
      const { error } = await supabase
        .from("leads")
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone || null,
          source: formData.source,
          estimated_monthly_value: formData.estimated_monthly_value
            ? parseFloat(formData.estimated_monthly_value)
            : null,
          notes: formData.notes || null,
          lead_type: formData.lead_type,
        })
        .eq("id", lead.id);

      if (error) throw error;

      toast({
        title: "Lead updated",
        description: "Lead details have been saved.",
      });

      onLeadUpdated();
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
    if (!lead) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase.from("leads").delete().eq("id", lead.id);

      if (error) throw error;

      toast({
        title: "Lead deleted",
        description: "Lead has been removed.",
      });

      onOpenChange(false);
      onLeadUpdated();
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

  const handleStageChange = async (newStage: string) => {
    if (!lead) return;

    try {
      const updateData: Record<string, any> = { pipeline_stage: newStage };

      if (newStage === "proposal_sent") {
        updateData.proposal_sent_at = new Date().toISOString();
      } else if (newStage === "chasing") {
        updateData.chasing_started_at = new Date().toISOString();
      } else if (newStage === "won") {
        updateData.won_at = new Date().toISOString();
      } else if (newStage === "lost") {
        updateData.lost_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", lead.id);

      if (error) throw error;

      toast({
        title: "Stage updated",
        description: `Lead moved to ${pipelineStages.find((s) => s.value === newStage)?.label}.`,
      });

      onLeadUpdated();
    } catch (error: any) {
      toast({
        title: "Error updating stage",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStageInfo = (stage: string) => {
    return pipelineStages.find((s) => s.value === stage);
  };

  const statusColors = {
    draft: "secondary",
    sent: "default",
    accepted: "default",
    rejected: "destructive",
    expired: "secondary",
  } as const;

  if (!lead) return null;

  const isCompanyLead = isCompanyBasedType(lead.lead_type);
  const stageInfo = getStageInfo(lead.pipeline_stage);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <div className="flex items-center gap-3">
            {isCompanyLead ? (
              <Building2 className="h-5 w-5 text-muted-foreground" />
            ) : (
              <User className="h-5 w-5 text-muted-foreground" />
            )}
            <SheetTitle className="flex-1">
              {lead.first_name} {lead.last_name}
            </SheetTitle>
          </div>
          <SheetDescription className="flex items-center gap-2 flex-wrap">
            <Badge className={stageInfo?.color}>{stageInfo?.label}</Badge>
            <Badge variant="outline">{CLIENT_TYPE_LABELS[lead.lead_type]}</Badge>
            <span className="text-xs flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Created {format(new Date(lead.created_at), "dd MMM yyyy")}
            </span>
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden mt-4">
          <TabsList className="flex-shrink-0 grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="quotes">
              Quotes
              {quotes && quotes.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                  {quotes.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="conversations">Messages</TabsTrigger>
            <TabsTrigger value="documents">Docs</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4">
            {/* Overview Tab */}
            <TabsContent value="overview" className="m-0 space-y-6">
              {/* Stage Selector */}
              <div className="space-y-2">
                <Label>Pipeline Stage</Label>
                <Select value={lead.pipeline_stage} onValueChange={handleStageChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelineStages.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${s.color}`} />
                          {s.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Lead Details Form */}
              <form onSubmit={handleUpdateLead} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="lead_type">Lead Type</Label>
                  <Select
                    value={formData.lead_type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, lead_type: value as ClientType })
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
                    <Label>
                      {isCompanyBasedType(formData.lead_type) ? "Company Name" : "First Name"}
                    </Label>
                    <Input
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      disabled={isUpdating}
                    />
                  </div>
                  {!isCompanyBasedType(formData.lead_type) && (
                    <div className="space-y-2">
                      <Label>Last Name</Label>
                      <Input
                        value={formData.last_name}
                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                        disabled={isUpdating}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={isUpdating}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Phone</Label>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      disabled={isUpdating}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Source</Label>
                    <Select
                      value={formData.source}
                      onValueChange={(value) => setFormData({ ...formData, source: value })}
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
                    <Label>Est. Monthly Value (£)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.estimated_monthly_value}
                      onChange={(e) =>
                        setFormData({ ...formData, estimated_monthly_value: e.target.value })
                      }
                      disabled={isUpdating}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    disabled={isUpdating}
                  />
                </div>

                <div className="flex justify-between pt-4">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive" size="sm" disabled={isDeleting}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this lead and any associated quotes. This
                          action cannot be undone.
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
              </form>
            </TabsContent>

            {/* Quotes Tab */}
            <TabsContent value="quotes" className="m-0 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">Quotes</h3>
                  <p className="text-xs text-muted-foreground">
                    {quotes?.length || 0} quote{quotes?.length !== 1 ? "s" : ""} for this lead
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/quotes?create=true&lead_id=${lead.id}`);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Quote
                </Button>
              </div>

              {quotesLoading ? (
                <div className="text-sm text-muted-foreground">Loading quotes...</div>
              ) : quotes && quotes.length > 0 ? (
                <div className="space-y-3">
                  {quotes.map((quote) => (
                    <div
                      key={quote.id}
                      className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/quotes/${quote.id}`)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm font-medium">{quote.quote_number}</span>
                        <Badge variant={statusColors[quote.status as keyof typeof statusColors]}>
                          {quote.status.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Created {format(new Date(quote.created_at), "dd MMM yyyy")}
                        </span>
                        <span className="font-medium">£{quote.total_amount.toFixed(2)}</span>
                      </div>
                      {quote.valid_until && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Valid until {format(new Date(quote.valid_until), "dd MMM yyyy")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                  <FileText className="h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">No quotes yet</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onOpenChange(false);
                      navigate(`/quotes?create=true&lead_id=${lead.id}`);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Quote
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Conversations Tab */}
            <TabsContent value="conversations" className="m-0 space-y-4">
              <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                <MessageSquare className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-2">Email conversations</p>
                <p className="text-xs text-muted-foreground">
                  Email history with this lead will appear here
                </p>
              </div>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="m-0 space-y-4">
              <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                <FileText className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-2">Shared documents</p>
                <p className="text-xs text-muted-foreground">
                  Upload and manage documents for this lead
                </p>
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};
