import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Eye } from "lucide-react";
import { useOrganization as useOrg } from "@/lib/organization-context";

interface Variant {
  id: string;
  organization_id: string;
  variant_group_key: string | null;
  client_type: string | null;
  service_code: string | null;
  legal_entity: string | null;
  engagement_kind: string;
  is_default: boolean;
  is_active: boolean;
  subject: string;
  body: string;
  merge_fields: string[] | null;
}

const ENGAGEMENT_KINDS = [
  { value: "recurring", label: "Recurring" },
  { value: "one_off", label: "One-Off" },
  { value: "annual_renewal", label: "Annual Renewal" },
];

const CLIENT_TYPES = ["", "limited_company", "sole_trader", "partnership", "llp", "charity", "individual", "trust", "other"];
const SERVICE_CODES = ["", "accounts_filing", "ct_filing", "vat_filing", "payroll", "sa_filing", "bookkeeping", "cis", "confirmation_statement"];

const SAMPLE_CONTEXT: Record<string, string> = {
  "recipient_name": "Jane Smith",
  "client.name": "Jane Smith",
  "firm_name": "",
  "firm.name": "",
  "signing_url": "https://client.accountancyos.com/engagement/sample-token",
};

const renderPlaceholders = (text: string, firmName: string): string => {
  const ctx = { ...SAMPLE_CONTEXT, firm_name: firmName, "firm.name": firmName };
  return Object.entries(ctx).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v),
    text,
  );
};

const EMPTY: Omit<Variant, "id" | "organization_id"> = {
  variant_group_key: null,
  client_type: null,
  service_code: null,
  legal_entity: null,
  engagement_kind: "recurring",
  is_default: false,
  is_active: true,
  subject: "",
  body: "",
  merge_fields: [],
};

export default function EngagementLetterVariants() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Variant | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [showPreview, setShowPreview] = useState(false);

  const { data: variants, isLoading } = useQuery({
    queryKey: ["engagement-letter-variants", organization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("engagement_letter_template_variants")
        .select("*")
        .eq("organization_id", organization!.id)
        .order("is_default", { ascending: false })
        .order("engagement_kind");
      if (error) throw error;
      return data as Variant[];
    },
    enabled: !!organization?.id,
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editing) {
        const { error } = await supabase
          .from("engagement_letter_template_variants")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("engagement_letter_template_variants")
          .insert({ ...payload, organization_id: organization!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagement-letter-variants"] });
      toast.success(editing ? "Variant Updated" : "Variant Created");
      setEditing(null);
      setCreating(false);
      setForm(EMPTY);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("engagement_letter_template_variants")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagement-letter-variants"] });
      toast.success("Variant Deleted");
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => {
    setForm(EMPTY);
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (v: Variant) => {
    setForm({
      variant_group_key: v.variant_group_key,
      client_type: v.client_type,
      service_code: v.service_code,
      legal_entity: v.legal_entity,
      engagement_kind: v.engagement_kind,
      is_default: v.is_default,
      is_active: v.is_active,
      subject: v.subject,
      body: v.body,
      merge_fields: v.merge_fields ?? [],
    });
    setEditing(v);
    setCreating(false);
  };

  const handleSave = () => {
    if (!form.subject.trim() || !form.body.trim()) {
      toast.error("Subject And Body Are Required");
      return;
    }
    upsertMutation.mutate({
      ...form,
      client_type: form.client_type || null,
      service_code: form.service_code || null,
      legal_entity: form.legal_entity || null,
      variant_group_key: form.variant_group_key || null,
    });
  };

  const open = creating || !!editing;
  const firmName = organization?.name || "Your Firm";
  const previewSubject = renderPlaceholders(form.subject || "(No Subject)", firmName);
  const previewBody = renderPlaceholders(form.body || "(No Body)", firmName);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Engagement Letter Variants</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage per-service and per-entity engagement letter wording. The most specific active variant is selected at send-time.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Variant
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active Variants</CardTitle>
            <CardDescription>
              Defaults apply when no specific match is found. Unique constraint prevents duplicates per client type / service / legal entity / kind.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : variants && variants.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Client Type</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.subject}</TableCell>
                      <TableCell>{v.client_type || "Any"}</TableCell>
                      <TableCell>{v.service_code || "Any"}</TableCell>
                      <TableCell>
                        {ENGAGEMENT_KINDS.find((k) => k.value === v.engagement_kind)?.label}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {v.is_default && <Badge variant="default">Default</Badge>}
                          {v.is_active ? (
                            <Badge variant="secondary">Active</Badge>
                          ) : (
                            <Badge variant="outline">Inactive</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(v)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteId(v.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No variants configured. Create one to override the default engagement letter wording.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!o) { setEditing(null); setCreating(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Variant" : "New Variant"}</DialogTitle>
            <DialogDescription>
              Leave client type or service blank to make the variant apply to any value at that level.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Engagement Kind</Label>
                <Select
                  value={form.engagement_kind}
                  onValueChange={(v) => setForm({ ...form, engagement_kind: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENGAGEMENT_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Variant Group Key (Optional)</Label>
                <Input
                  value={form.variant_group_key ?? ""}
                  onChange={(e) => setForm({ ...form, variant_group_key: e.target.value })}
                  placeholder="e.g. standard, premium"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client Type</Label>
                <Select
                  value={form.client_type ?? "any"}
                  onValueChange={(v) => setForm({ ...form, client_type: v === "any" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    {CLIENT_TYPES.map((t) => (
                      <SelectItem key={t || "any"} value={t || "any"}>{t || "Any"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Service Code</Label>
                <Select
                  value={form.service_code ?? "any"}
                  onValueChange={(v) => setForm({ ...form, service_code: v === "any" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_CODES.map((s) => (
                      <SelectItem key={s || "any"} value={s || "any"}>{s || "Any"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Legal Entity (Optional)</Label>
              <Input
                value={form.legal_entity ?? ""}
                onChange={(e) => setForm({ ...form, legal_entity: e.target.value })}
                placeholder="e.g. ltd, llp"
              />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Engagement Letter For {{client.name}}"
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={10}
                placeholder="Use {{placeholder}} syntax for dynamic fields"
              />
            </div>
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Eye className="h-4 w-4" />
                  Preview With Sample Data
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview((s) => !s)}
                >
                  {showPreview ? "Hide" : "Show"}
                </Button>
              </div>
              {showPreview && (
                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Subject</div>
                    <div className="font-medium">{previewSubject}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Body</div>
                    <div
                      className="rounded border bg-background p-2 max-h-64 overflow-y-auto whitespace-pre-wrap text-foreground"
                      dangerouslySetInnerHTML={{ __html: previewBody }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sample values: recipient_name = Jane Smith, firm_name = {firmName}, signing_url = example token.
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_default}
                  onCheckedChange={(v) => setForm({ ...form, is_default: v })}
                />
                <Label>Default Variant</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <Label>Active</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setCreating(false); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variant</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the variant. Any future sends will fall back to a more general or default variant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
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