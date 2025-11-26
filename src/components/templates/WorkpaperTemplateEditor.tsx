import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface WorkpaperSection {
  id: string;
  title: string;
  description?: string;
  fields: WorkpaperField[];
}

interface WorkpaperField {
  id: string;
  label: string;
  type: "text" | "number" | "dropdown" | "checkbox" | "file" | "date" | "yesno" | "calculation";
  required: boolean;
  options?: string[];
  calculation?: string;
}

interface WorkpaperTemplateEditorProps {
  content: any;
  onChange: (content: any) => void;
}

export default function WorkpaperTemplateEditor({ content, onChange }: WorkpaperTemplateEditorProps) {
  const sections: WorkpaperSection[] = content.sections || [];

  const addSection = () => {
    const newSection: WorkpaperSection = {
      id: crypto.randomUUID(),
      title: "New Section",
      fields: [],
    };
    onChange({ ...content, sections: [...sections, newSection] });
  };

  const updateSection = (sectionId: string, updates: Partial<WorkpaperSection>) => {
    const updatedSections = sections.map((s) =>
      s.id === sectionId ? { ...s, ...updates } : s
    );
    onChange({ ...content, sections: updatedSections });
  };

  const deleteSection = (sectionId: string) => {
    onChange({ ...content, sections: sections.filter((s) => s.id !== sectionId) });
  };

  const addField = (sectionId: string) => {
    const newField: WorkpaperField = {
      id: crypto.randomUUID(),
      label: "New Field",
      type: "text",
      required: false,
    };
    updateSection(sectionId, {
      fields: [...(sections.find((s) => s.id === sectionId)?.fields || []), newField],
    });
  };

  const updateField = (sectionId: string, fieldId: string, updates: Partial<WorkpaperField>) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const updatedFields = section.fields.map((f) =>
      f.id === fieldId ? { ...f, ...updates } : f
    );
    updateSection(sectionId, { fields: updatedFields });
  };

  const deleteField = (sectionId: string, fieldId: string) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    updateSection(sectionId, {
      fields: section.fields.filter((f) => f.id !== fieldId),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Workpaper Builder</CardTitle>
        <Button onClick={addSection}>
          <Plus className="mr-2 h-4 w-4" />
          Add Section
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {sections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No sections yet. Click "Add Section" to get started.
          </div>
        ) : (
          sections.map((section, sectionIndex) => (
            <Card key={section.id} className="border-2">
              <CardHeader className="bg-muted/50">
                <div className="flex items-start gap-4">
                  <GripVertical className="h-5 w-5 text-muted-foreground mt-2" />
                  <div className="flex-1 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Section Title</Label>
                        <Input
                          value={section.title}
                          onChange={(e) =>
                            updateSection(section.id, { title: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Description (optional)</Label>
                        <Input
                          value={section.description || ""}
                          onChange={(e) =>
                            updateSection(section.id, { description: e.target.value })
                          }
                          placeholder="Section instructions"
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteSection(section.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {section.fields.map((field) => (
                  <div key={field.id} className="flex items-start gap-4 p-4 border rounded-lg">
                    <GripVertical className="h-5 w-5 text-muted-foreground mt-2" />
                    <div className="flex-1 grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Field Label</Label>
                        <Input
                          value={field.label}
                          onChange={(e) =>
                            updateField(section.id, field.id, { label: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Field Type</Label>
                        <Select
                          value={field.type}
                          onValueChange={(value) =>
                            updateField(section.id, field.id, { type: value as any })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="dropdown">Dropdown</SelectItem>
                            <SelectItem value="checkbox">Checkbox</SelectItem>
                            <SelectItem value="file">File Upload</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="yesno">Yes/No</SelectItem>
                            <SelectItem value="calculation">Calculation</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 flex items-center gap-2 pt-8">
                        <Switch
                          checked={field.required}
                          onCheckedChange={(checked) =>
                            updateField(section.id, field.id, { required: checked })
                          }
                        />
                        <Label>Required</Label>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteField(section.id, field.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  onClick={() => addField(section.id)}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Field
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </CardContent>
    </Card>
  );
}
