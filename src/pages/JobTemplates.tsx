import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Search,
  MoreHorizontal,
  FileText,
  Receipt,
  Calculator,
  Users,
  Copy,
  Trash2,
  Eye,
  Edit,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { TEMPLATE_PRESETS, TemplatePreset } from "@/lib/job-template-types";
import { JobTemplateEditorFullscreen } from "@/components/templates/JobTemplateEditorFullscreen";

export default function JobTemplates() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<TemplatePreset | null>(null);

  // Fetch templates
  const { data: templates, isLoading } = useQuery({
    queryKey: ["job-templates", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("job_templates")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("name");

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: async (preset?: TemplatePreset) => {
      if (!currentOrganization?.id) throw new Error("No organization");

      const templateData = {
        organization_id: currentOrganization.id,
        name: preset?.name || "New Template",
        service_type: preset?.metadata.serviceCode || "OTHER",
        is_active: true,
        version: 1,
        frequency: preset?.metadata.frequency || "one_off",
        trigger_type: preset?.metadata.triggerType || "manual",
        relative_due_offset: preset?.metadata.relativeDueOffset || 30,
        ui_category: preset?.metadata.uiCategory || "General",
        tasks: preset?.content || {},
        records_requests_template: preset?.content?.recordsRequests || [],
      };

      const { data, error } = await supabase
        .from("job_templates")
        .insert(templateData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["job-templates"] });
      setSelectedTemplate(data.id);
      setIsCreating(false);
      setSelectedPreset(null);
      toast.success("Template created");
    },
    onError: (error) => {
      toast.error("Failed to create template");
      console.error(error);
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("job_templates")
        .update({ is_active: isActive })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-templates"] });
      toast.success("Template updated");
    },
  });

  // Clone template mutation
  const cloneMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const template = templates?.find((t) => t.id === templateId);
      if (!template || !currentOrganization?.id) throw new Error("Template not found");

      const { data, error } = await supabase
        .from("job_templates")
        .insert({
          organization_id: currentOrganization.id,
          name: `${template.name} (Copy)`,
          service_type: template.service_type,
          is_active: false,
          version: 1,
          frequency: template.frequency,
          trigger_type: template.trigger_type,
          relative_due_offset: template.relative_due_offset,
          ui_category: template.ui_category,
          tasks: template.tasks,
          trigger_conditions: template.trigger_conditions,
          entity_filters: template.entity_filters,
          records_requests_template: template.records_requests_template,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["job-templates"] });
      setSelectedTemplate(data.id);
      toast.success("Template cloned");
    },
  });

  // Filter templates
  const filteredTemplates = templates?.filter((template) => {
    const matchesSearch =
      searchQuery === "" ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.service_type?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      categoryFilter === "all" || template.ui_category === categoryFilter;

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && template.is_active) ||
      (statusFilter === "inactive" && !template.is_active);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Get unique categories
  const categories = Array.from(
    new Set(templates?.map((t) => t.ui_category).filter(Boolean) || [])
  );

  const getPresetIcon = (iconName: string) => {
    switch (iconName) {
      case "Receipt":
        return <Receipt className="h-8 w-8" />;
      case "FileText":
        return <FileText className="h-8 w-8" />;
      case "Calculator":
        return <Calculator className="h-8 w-8" />;
      case "Users":
        return <Users className="h-8 w-8" />;
      default:
        return <FileText className="h-8 w-8" />;
    }
  };

  const getFrequencyBadge = (frequency: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      monthly: "default",
      quarterly: "secondary",
      annual: "outline",
      one_off: "outline",
      triggered: "secondary",
    };
    return (
      <Badge variant={variants[frequency] || "outline"}>
        {frequency?.replace("_", " ")}
      </Badge>
    );
  };

  if (selectedTemplate) {
    return (
      <JobTemplateEditorFullscreen
        templateId={selectedTemplate}
        onClose={() => setSelectedTemplate(null)}
      />
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Job Templates</h1>
            <p className="text-muted-foreground">
              Create and manage reusable job templates for automated job generation
            </p>
          </div>
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>

        {/* Create Template Modal */}
        {isCreating && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle>Choose a starting point</CardTitle>
              <CardDescription>
                Start from a preset or create a blank template
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {TEMPLATE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPreset(preset)}
                    className={`p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50 ${
                      selectedPreset?.id === preset.id
                        ? "border-primary bg-primary/10"
                        : "border-border"
                    }`}
                  >
                    <div className="text-primary mb-2">{getPresetIcon(preset.icon)}</div>
                    <div className="font-medium">{preset.name}</div>
                    <div className="text-sm text-muted-foreground">{preset.description}</div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => createMutation.mutate(selectedPreset || undefined)}
                  disabled={createMutation.isPending}
                >
                  {selectedPreset ? `Create from ${selectedPreset.name}` : "Create Blank Template"}
                </Button>
                <Button variant="outline" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat || ""}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Templates Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading templates...
                  </TableCell>
                </TableRow>
              ) : filteredTemplates?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No templates found. Create your first template to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredTemplates?.map((template) => (
                  <TableRow
                    key={template.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedTemplate(template.id)}
                  >
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{template.ui_category || "General"}</Badge>
                    </TableCell>
                    <TableCell>{getFrequencyBadge(template.frequency || "one_off")}</TableCell>
                    <TableCell>{template.service_type}</TableCell>
                    <TableCell>v{template.version || 1}</TableCell>
                    <TableCell>
                      {template.is_active ? (
                        <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {template.updated_at
                        ? format(new Date(template.updated_at), "dd MMM yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedTemplate(template.id)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => cloneMutation.mutate(template.id)}>
                            <Copy className="h-4 w-4 mr-2" />
                            Clone
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              toggleActiveMutation.mutate({
                                id: template.id,
                                isActive: !template.is_active,
                              })
                            }
                          >
                            {template.is_active ? (
                              <>
                                <XCircle className="h-4 w-4 mr-2" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </DashboardLayout>
  );
}
