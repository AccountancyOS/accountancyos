import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronDown, Loader2 } from "lucide-react";

interface TemplatePickerDropdownProps {
  onSelect: (template: { subject: string; body: string; htmlBody?: string }) => void;
}

interface EmailTemplate {
  id: string;
  name: string;
  organization_id: string | null;
  content: {
    subject?: string;
    body?: string;
    htmlBody?: string;
    category?: string;
  };
}

export function TemplatePickerDropdown({ onSelect }: TemplatePickerDropdownProps) {
  const { organization } = useOrganization();
  const [open, setOpen] = useState(false);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["email-templates", organization?.id],
    queryFn: async () => {
      // Fetch both system templates (org_id is null) and org-specific templates
      const { data, error } = await supabase
        .from("templates")
        .select("id, name, organization_id, content")
        .eq("type", "email")
        .eq("status", "active")
        .or(`organization_id.is.null,organization_id.eq.${organization?.id}`)
        .order("name");

      if (error) throw error;
      return data as EmailTemplate[];
    },
    enabled: open && !!organization?.id,
  });

  // Group templates by category
  const groupedTemplates = templates?.reduce((acc, template) => {
    const category = template.content?.category || "General";
    if (!acc[category]) acc[category] = [];
    acc[category].push(template);
    return acc;
  }, {} as Record<string, EmailTemplate[]>);

  const handleSelect = (template: EmailTemplate) => {
    onSelect({
      subject: template.content?.subject || "",
      body: template.content?.htmlBody || template.content?.body || "",
      htmlBody: template.content?.htmlBody,
    });
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText className="h-4 w-4 mr-2" />
          Use Template
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        <DropdownMenuLabel>Email Templates</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !templates || templates.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No email templates available
          </div>
        ) : (
          Object.entries(groupedTemplates || {}).map(([category, categoryTemplates]) => (
            <DropdownMenuGroup key={category}>
              <DropdownMenuLabel className="text-xs text-muted-foreground capitalize">
                {category}
              </DropdownMenuLabel>
              {categoryTemplates.map((template) => (
                <DropdownMenuItem
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="truncate">{template.name}</span>
                    {template.organization_id === null && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        System
                      </Badge>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}