import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save } from "lucide-react";
import WorkpaperTemplateEditor from "@/components/templates/WorkpaperTemplateEditor";
import EmailTemplateEditor from "@/components/templates/EmailTemplateEditor";
import JobTemplateEditor from "@/components/templates/JobTemplateEditor";
import QuestionnaireFlowBuilder from "@/components/templates/QuestionnaireFlowBuilder";
import QuestionnaireTemplateEditor from "@/components/templates/QuestionnaireTemplateEditor";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export default function TemplateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { organization } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isNew = id === "new";
  const templateType = searchParams.get("type") || "workpaper";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [service, setService] = useState("");
  const [status, setStatus] = useState("inactive");
  const [content, setContent] = useState<any>({});
  const [questionnaireView, setQuestionnaireView] = useState<"flow" | "list">("flow");

  const { data: template, isLoading } = useQuery({
    queryKey: ["template", id],
    queryFn: async () => {
      if (isNew || !id) return null;
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !isNew && !!id,
  });

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || "");
      setService(template.service || "");
      setStatus(template.status);
      setContent(template.content || {});
    }
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organization?.id || !user?.id) throw new Error("Missing organization or user");

      const templateData = {
        organization_id: organization.id,
        name,
        description,
        type: isNew ? templateType : template?.type,
        service,
        status,
        content,
        created_by: user.id,
      };

      if (isNew) {
        const { data, error } = await supabase
          .from("templates")
          .insert(templateData)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("templates")
          .update({
            name,
            description,
            service,
            status,
            content,
            version_number: (template?.version_number || 0) + 1,
          })
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;

        // Save version history
        await supabase.from("template_versions").insert({
          template_id: id,
          version_number: (template?.version_number || 0) + 1,
          content,
          created_by: user.id,
        });

        return data;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["template", id] });
      toast({
        title: "Success",
        description: isNew ? "Template created successfully" : "Template updated successfully",
      });
      if (isNew) {
        navigate(`/templates/${data.id}`);
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!name.trim()) {
      toast({
        title: "Validation Error",
        description: "Template name is required",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate();
  };

  if (!isNew && isLoading) {
    return (
      <DashboardLayout>
        <div>Loading template...</div>
      </DashboardLayout>
    );
  }

  const currentType = isNew ? templateType : template?.type;

  return (
    <DashboardLayout>
      <div className="flex-1 overflow-auto">
        <div className="p-8 space-y-6">
          <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/templates")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h2 className="text-3xl font-bold">
                {isNew ? "New Template" : "Edit Template"}
              </h2>
              <p className="text-muted-foreground">
                {currentType?.charAt(0).toUpperCase() + currentType?.slice(1)} Template
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(currentType === "questionnaire" || currentType === "records_request") && (
              <ToggleGroup type="single" value={questionnaireView} onValueChange={(v) => v && setQuestionnaireView(v as "flow" | "list")}>
                <ToggleGroupItem value="flow" aria-label="Flow view">
                  Flow View
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List view">
                  List View
                </ToggleGroupItem>
              </ToggleGroup>
            )}
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </div>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Template Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Annual Accounts Workpaper"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="service">Service</Label>
                <Select value={service} onValueChange={setService}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Accounts">Accounts</SelectItem>
                    <SelectItem value="SA">Self Assessment</SelectItem>
                    <SelectItem value="VAT">VAT</SelectItem>
                    <SelectItem value="Bookkeeping">Bookkeeping</SelectItem>
                    <SelectItem value="Payroll">Payroll</SelectItem>
                    <SelectItem value="CoSec">Company Secretarial</SelectItem>
                    <SelectItem value="Advisory">Advisory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this template"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Template Type-Specific Editor */}
        {currentType === "workpaper" && (
          <WorkpaperTemplateEditor content={content} onChange={setContent} />
        )}
        {currentType === "email" && (
          <EmailTemplateEditor content={content} onChange={setContent} />
        )}
        {currentType === "job" && (
          <JobTemplateEditor content={content} onChange={setContent} />
        )}
        {(currentType === "task" || currentType === "checklist") && (
          <Card>
            <CardHeader>
              <CardTitle>Task/Checklist Builder</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Task and checklist template editor coming soon...</p>
            </CardContent>
          </Card>
        )}
        {currentType === "automation" && (
          <Card>
            <CardHeader>
              <CardTitle>Automation Rules Builder</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Automation template editor coming soon...</p>
            </CardContent>
          </Card>
        )}
        {(currentType === "questionnaire" || currentType === "records_request") && (
          <>
            {questionnaireView === "flow" ? (
              <QuestionnaireFlowBuilder content={content} onChange={setContent} />
            ) : (
              <QuestionnaireTemplateEditor content={content} onChange={setContent} />
            )}
          </>
        )}
        </div>
      </div>
    </DashboardLayout>
  );
}
