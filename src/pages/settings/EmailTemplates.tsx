import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  Pencil, 
  Copy, 
  Trash2,
  Mail,
  ArrowLeft,
  FileText,
  Building2,
  Lock
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatStatus } from "@/lib/format-utils";

interface EmailTemplate {
  id: string;
  name: string;
  organization_id: string | null;
  content: {
    subject?: string;
    body?: string;
    htmlBody?: string;
    category?: string;
    placeholders_used?: string[];
  };
  status: string;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = ["All", "general", "onboarding", "chasing", "billing", "filing", "records"];

export default function EmailTemplates() {
  const navigate = useNavigate();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["email-templates-all", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .eq("type", "email")
        .or(`organization_id.is.null,organization_id.eq.${organization?.id}`)
        .order("name");

      if (error) throw error;
      return data as EmailTemplate[];
    },
    enabled: !!organization?.id,
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: EmailTemplate) => {
      const { error } = await supabase.from("templates").insert({
        organization_id: organization?.id,
        name: `${template.name} (Copy)`,
        type: "email",
        status: "draft",
        content: template.content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates-all"] });
      toast.success("Template duplicated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase.from("templates").delete().eq("id", templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates-all"] });
      toast.success("Template deleted");
      setDeleteTemplateId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const filteredTemplates = templates?.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.content?.subject?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === "All" || t.content?.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const systemTemplates = filteredTemplates?.filter((t) => t.organization_id === null);
  const orgTemplates = filteredTemplates?.filter((t) => t.organization_id !== null);

  const getCategoryBadge = (category?: string) => {
    const colors: Record<string, string> = {
      general: "bg-blue-500/10 text-blue-600",
      onboarding: "bg-green-500/10 text-green-600",
      chasing: "bg-amber-500/10 text-amber-600",
      billing: "bg-purple-500/10 text-purple-600",
      filing: "bg-cyan-500/10 text-cyan-600",
      records: "bg-pink-500/10 text-pink-600",
    };
    const color = colors[category || "general"] || colors.general;
    return (
      <Badge variant="secondary" className={color}>
        {category || "general"}
      </Badge>
    );
  };

  const TemplateRow = ({ template }: { template: EmailTemplate }) => {
    const isSystem = template.organization_id === null;
    
    return (
      <TableRow className="group">
        <TableCell>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{template.name}</span>
                {isSystem && (
                  <Badge variant="outline" className="text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    System
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                {template.content?.subject || "No subject"}
              </p>
            </div>
          </div>
        </TableCell>
        <TableCell>{getCategoryBadge(template.content?.category)}</TableCell>
        <TableCell>
          <Badge variant={template.status === "active" ? "default" : "secondary"}>
            {formatStatus(template.status)}
          </Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">
          {format(new Date(template.updated_at), "d MMM yyyy")}
        </TableCell>
        <TableCell className="text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isSystem && (
                <DropdownMenuItem onClick={() => navigate(`/templates/${template.id}`)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => duplicateMutation.mutate(template)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              {!isSystem && (
                <DropdownMenuItem
                  onClick={() => setDeleteTemplateId(template.id)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Email Templates</h1>
            <p className="text-muted-foreground">
              Manage email templates for automation and manual sending
            </p>
          </div>
          <Button onClick={() => navigate("/templates?type=email")}>
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList>
            {CATEGORIES.map((cat) => (
              <TabsTrigger key={cat} value={cat} className="capitalize">
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeCategory} className="mt-6">
            {/* System Templates */}
            {systemTemplates && systemTemplates.length > 0 && (
              <Card className="mb-6">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">System Templates</CardTitle>
                  </div>
                  <CardDescription>
                    Pre-built templates available to all practices
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Template</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {systemTemplates.map((template) => (
                        <TemplateRow key={template.id} template={template} />
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Organization Templates */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Your Templates</CardTitle>
                </div>
                <CardDescription>
                  Custom templates for your practice
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Loading templates...
                  </div>
                ) : !orgTemplates || orgTemplates.length === 0 ? (
                  <div className="p-8 text-center">
                    <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="font-medium">No custom templates yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create your first email template or duplicate a system template
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => navigate("/templates?type=email")}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Template
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Template</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgTemplates.map((template) => (
                        <TemplateRow key={template.id} template={template} />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTemplateId} onOpenChange={() => setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This template will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTemplateId && deleteMutation.mutate(deleteTemplateId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}