import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileText, Mail, ListChecks, Workflow, Clock, ClipboardCheck } from "lucide-react";
import { CardSkeleton } from "@/components/ui/card-skeleton";
import { useNavigate } from "react-router-dom";
import { formatStatus } from "@/lib/format-utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Templates() {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: templates, isLoading } = useQuery({
    queryKey: ["templates", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .or(`organization_id.eq.${organization.id},organization_id.is.null`)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const filteredTemplates = templates?.filter((template) => {
    const matchesSearch = 
      template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || template.type === typeFilter;
    const matchesStatus = statusFilter === "all" || template.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const getTemplateIcon = (type: string) => {
    switch (type) {
      case "workpaper": return FileText;
      case "email": return Mail;
      case "job": return ListChecks;
      case "task": return ListChecks;
      case "checklist": return ListChecks;
      case "automation": return Workflow;
      case "questionnaire": return ClipboardCheck;
      case "records_request": return ClipboardCheck;
      default: return FileText;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "default";
      case "draft": return "secondary";
      case "deprecated": return "destructive";
      default: return "secondary";
    }
  };

  const handleCreateTemplate = (type: string) => {
    navigate(`/templates/new?type=${type}`);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-foreground">Templates</h1>
            <p className="text-muted-foreground mt-1">Manage firm-wide templates for workpapers, emails, jobs, and automation</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Template
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => handleCreateTemplate("workpaper")}>
                <FileText className="mr-2 h-4 w-4" />
                Workpaper Template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateTemplate("email")}>
                <Mail className="mr-2 h-4 w-4" />
                Email Template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateTemplate("job")}>
                <ListChecks className="mr-2 h-4 w-4" />
                Job Template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateTemplate("task")}>
                <ListChecks className="mr-2 h-4 w-4" />
                Task Template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateTemplate("checklist")}>
                <ListChecks className="mr-2 h-4 w-4" />
                Checklist Template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateTemplate("automation")}>
                <Workflow className="mr-2 h-4 w-4" />
                Automation Template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateTemplate("questionnaire")}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Questionnaire Template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateTemplate("records_request")}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Records Request Template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="workpaper">Workpaper</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="job">Job</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="checklist">Checklist</SelectItem>
                  <SelectItem value="automation">Automation</SelectItem>
                  <SelectItem value="questionnaire">Questionnaire</SelectItem>
                  <SelectItem value="records_request">Records Request</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="deprecated">Deprecated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Templates Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <CardSkeleton key={i} lines={2} />
            ))}
          </div>
        ) : filteredTemplates && filteredTemplates.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => {
              const Icon = getTemplateIcon(template.type);
              const isSystem = !template.organization_id;
              return (
                <Card 
                  key={template.id} 
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => navigate(isSystem ? `/templates/new?clone_from=${template.id}` : `/templates/${template.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        {isSystem && (
                          <Badge variant="outline" className="border-primary text-primary">
                            System
                          </Badge>
                        )}
                        <Badge variant={getStatusColor(template.status)}>
                          {formatStatus(template.status)}
                        </Badge>
                      </div>
                    </div>
                    {template.description && (
                      <CardDescription className="line-clamp-2">
                        {template.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {template.type}
                        </Badge>
                        {template.service && (
                          <Badge variant="outline" className="text-xs">
                            {template.service}
                          </Badge>
                        )}
                      </div>
                      {isSystem ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/templates/new?clone_from=${template.id}`);
                          }}
                        >
                          Clone & Customise
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(template.updated_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No templates found</h3>
              <p className="text-muted-foreground text-center mb-4">
                {searchTerm || typeFilter !== "all" || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Get started by creating your first template"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
