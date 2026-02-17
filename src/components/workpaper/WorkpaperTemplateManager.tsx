import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/lib/organization-context";
import {
  listWorkpaperTemplates,
  upsertWorkpaperTemplate,
  deactivateWorkpaperTemplate,
  type WorkpaperTemplateRow,
} from "@/lib/workpaper-template-service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Copy, Lock } from "lucide-react";
import { toast } from "sonner";
import { TableSkeleton } from "@/components/ui/table-skeleton";

const JOB_TYPE_LABELS: Record<string, string> = {
  SA_NON_MTD: "Self Assessment (Non-MTD)",
  SA_MTD: "Self Assessment (MTD)",
  LTD_ACCOUNTS: "Annual Accounts",
  CT600: "Corporation Tax",
  PARTNERSHIP: "Partnership",
  VAT: "VAT Return",
  PAYROLL: "Payroll",
  CIS: "CIS",
  BOOKKEEPING: "Bookkeeping",
  OTHER: "Other",
};

export default function WorkpaperTemplateManager() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<WorkpaperTemplateRow | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formState, setFormState] = useState({
    name: "",
    description: "",
    job_type: "SA_NON_MTD",
    is_default: false,
    schema_json: '{"sections":[]}',
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["workpaper-templates", organization?.id],
    queryFn: () => listWorkpaperTemplates(organization!.id),
    enabled: !!organization?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      let schema: any;
      try {
        schema = JSON.parse(formState.schema_json);
      } catch {
        throw new Error("Invalid JSON in schema");
      }
      return upsertWorkpaperTemplate(organization!.id, {
        id: editingTemplate?.id,
        job_type: formState.job_type,
        name: formState.name,
        description: formState.description || undefined,
        schema_json: schema,
        is_default: formState.is_default,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workpaper-templates"] });
      toast.success(editingTemplate ? "Template updated" : "Template created");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deactivateWorkpaperTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workpaper-templates"] });
      toast.success("Template deactivated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreate() {
    setEditingTemplate(null);
    setFormState({ name: "", description: "", job_type: "SA_NON_MTD", is_default: false, schema_json: '{"sections":[]}' });
    setShowCreateDialog(true);
  }

  function openEdit(t: WorkpaperTemplateRow) {
    setEditingTemplate(t);
    setFormState({
      name: t.name,
      description: t.description ?? "",
      job_type: t.job_type,
      is_default: t.is_default,
      schema_json: JSON.stringify(t.schema_json, null, 2),
    });
    setShowCreateDialog(true);
  }

  function closeDialog() {
    setShowCreateDialog(false);
    setEditingTemplate(null);
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Workpaper Templates</CardTitle>
            <CardDescription>
              Practice-level templates applied to new jobs. System templates are read-only.
            </CardDescription>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton columns={5} rows={4} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Job Type</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates?.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {t.name}
                        {t.is_system && (
                          <Badge variant="secondary" className="text-xs">
                            <Lock className="h-3 w-3 mr-1" />
                            System
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{JOB_TYPE_LABELS[t.job_type] ?? t.job_type}</TableCell>
                    <TableCell>
                      {t.is_default && <Badge variant="default">Default</Badge>}
                    </TableCell>
                    <TableCell>v{t.version}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {!t.is_system && (
                          <>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(t.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Duplicate as org template"
                          onClick={() => {
                            setEditingTemplate(null);
                            setFormState({
                              name: `${t.name} (Copy)`,
                              description: t.description ?? "",
                              job_type: t.job_type,
                              is_default: false,
                              schema_json: JSON.stringify(t.schema_json, null, 2),
                            });
                            setShowCreateDialog(true);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!templates || templates.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No templates found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={formState.name}
                  onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Job Type</Label>
                <Select
                  value={formState.job_type}
                  onValueChange={(v) => setFormState((s) => ({ ...s, job_type: v }))}
                  disabled={!!editingTemplate}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(JOB_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formState.description}
                onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formState.is_default}
                onCheckedChange={(c) => setFormState((s) => ({ ...s, is_default: c }))}
              />
              <Label>Set as default for this job type</Label>
            </div>
            <div className="space-y-2">
              <Label>Schema JSON</Label>
              <Textarea
                className="font-mono text-xs min-h-[200px]"
                value={formState.schema_json}
                onChange={(e) => setFormState((s) => ({ ...s, schema_json: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
