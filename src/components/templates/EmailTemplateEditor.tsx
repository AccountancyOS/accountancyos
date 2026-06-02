import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Plus, Link as LinkIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EmailTemplateEditorProps {
  content: any;
  onChange: (content: any) => void;
  templateName?: string;
}

export default function EmailTemplateEditor({ content, onChange, templateName }: EmailTemplateEditorProps) {
  const { organization } = useOrganization();
  const [subject, setSubject] = useState(content.subject || "");
  const [body, setBody] = useState(content.body || "");
  const [htmlBody, setHtmlBody] = useState(content.htmlBody || "");
  const [category, setCategory] = useState(content.category || "");
  const [showQuestionnaireDialog, setShowQuestionnaireDialog] = useState(false);
  const [selectedQuestionnaire, setSelectedQuestionnaire] = useState("");

  const { data: mergeFields } = useQuery({
    queryKey: ["merge-fields"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_merge_fields")
        .select("*")
        .order("field_category", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: questionnaires } = useQuery({
    queryKey: ["questionnaire-templates", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("type", "questionnaire")
        .eq("status", "active");
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  const handleChange = (field: string, value: string) => {
    const updates = { ...content, [field]: value };
    if (field === "subject") setSubject(value);
    if (field === "body") setBody(value);
    if (field === "htmlBody") setHtmlBody(value);
    if (field === "category") setCategory(value);
    onChange(updates);
  };

  const insertMergeField = (fieldKey: string, targetField: "subject" | "body" | "htmlBody") => {
    const mergeTag = `{{${fieldKey}}}`;
    if (targetField === "subject") {
      handleChange("subject", subject + mergeTag);
    } else if (targetField === "body") {
      handleChange("body", body + mergeTag);
    } else {
      handleChange("htmlBody", htmlBody + mergeTag);
    }
  };

  const insertQuestionnaireLink = () => {
    if (!selectedQuestionnaire) return;
    const linkTag = `{{questionnaire_link:${selectedQuestionnaire}}}`;
    handleChange("body", body + `\n\n[Complete Questionnaire](${linkTag})\n`);
    setShowQuestionnaireDialog(false);
    setSelectedQuestionnaire("");
  };

  const groupedFields = mergeFields?.reduce((acc, field) => {
    const types: string[] = (field as any).template_types ?? ["all"];
    const isQuoteTemplate =
      (templateName ?? "").toLowerCase().includes("quote proposal") ||
      (content?.category ?? "").toLowerCase() === "quotes";
    const allowed =
      types.includes("all") || (isQuoteTemplate && types.includes("quote_proposal"));
    if (!allowed) return acc;
    if (!acc[field.field_category]) {
      acc[field.field_category] = [];
    }
    acc[field.field_category].push(field);
    return acc;
  }, {} as Record<string, typeof mergeFields>);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Email Content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category">Email Category</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => handleChange("category", e.target.value)}
                placeholder="e.g. SA records collection, Accounts request"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => handleChange("subject", e.target.value)}
                placeholder="Email subject..."
              />
            </div>
            <Tabs defaultValue="rich">
              <TabsList>
                <TabsTrigger value="rich">Rich Text</TabsTrigger>
                <TabsTrigger value="html">HTML</TabsTrigger>
              </TabsList>
              <TabsContent value="rich" className="space-y-2">
                <Label htmlFor="body">Email Body</Label>
                <Textarea
                  id="body"
                  value={body}
                  onChange={(e) => handleChange("body", e.target.value)}
                  placeholder="Email content..."
                  rows={15}
                  className="font-mono"
                />
              </TabsContent>
              <TabsContent value="html" className="space-y-2">
                <Label htmlFor="htmlBody">HTML Body</Label>
                <Textarea
                  id="htmlBody"
                  value={htmlBody}
                  onChange={(e) => handleChange("htmlBody", e.target.value)}
                  placeholder="<html>...</html>"
                  rows={15}
                  className="font-mono"
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Merge Fields</CardTitle>
            <p className="text-sm text-muted-foreground">
              Click a field to insert it into your email
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {groupedFields && Object.entries(groupedFields).map(([category, fields]) => (
              <div key={category} className="space-y-2">
                <h4 className="text-sm font-semibold capitalize">{category}</h4>
                <div className="flex flex-wrap gap-2">
                  {fields.map((field) => (
                    <Badge
                      key={field.id}
                      variant="secondary"
                      className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                      onClick={() => insertMergeField(field.field_key, "body")}
                    >
                      {field.field_label}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Questionnaire Links</CardTitle>
            <p className="text-sm text-muted-foreground">
              Insert a link to a questionnaire
            </p>
          </CardHeader>
          <CardContent>
            <Dialog open={showQuestionnaireDialog} onOpenChange={setShowQuestionnaireDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Insert Questionnaire Link
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Insert Questionnaire Link</DialogTitle>
                  <DialogDescription>
                    Choose a questionnaire template to link in this email
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Questionnaire Template</Label>
                    <Select value={selectedQuestionnaire} onValueChange={setSelectedQuestionnaire}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select questionnaire" />
                      </SelectTrigger>
                      <SelectContent>
                        {questionnaires?.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={insertQuestionnaireLink} disabled={!selectedQuestionnaire} className="w-full">
                    Insert Link
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">
              <div className="font-semibold">Subject:</div>
              <div className="text-muted-foreground">{subject || "(No subject)"}</div>
            </div>
            <div className="text-sm">
              <div className="font-semibold">Body Preview:</div>
              <div className="text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">
                {body || "(No body content)"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
