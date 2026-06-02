import { useState, useRef } from "react";
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
import { Loader2, Plus, Pencil, Trash2, Eye, Bold, Italic, List, Heading2, Variable } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CLIENT_TYPES as CLIENT_TYPE_VALUES, CLIENT_TYPE_LABELS, getClientTypeLabel } from "@/lib/client-types";
import { formatServiceType } from "@/lib/format-utils";

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

const CLIENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any" },
  ...CLIENT_TYPE_VALUES.map((v) => ({ value: v, label: CLIENT_TYPE_LABELS[v] })),
];
const SERVICE_CODE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any" },
  { value: "accounts_filing", label: "Company Accounts" },
  { value: "ct_filing", label: "Company Tax Return" },
  { value: "vat_filing", label: "VAT Return" },
  { value: "payroll", label: "Payroll" },
  { value: "sa_filing", label: "Self-Assessment Tax Return" },
  { value: "bookkeeping", label: "Bookkeeping" },
  { value: "cis", label: "CIS" },
  { value: "confirmation_statement", label: "Confirmation Statement" },
  { value: "cgt_filing", label: "Capital Gains Tax Return" },
  { value: "p11d", label: "P11D" },
  { value: "pensions", label: "Pensions" },
  { value: "registered_office", label: "Registered Office Address" },
  { value: "advisory", label: "Advisory" },
];

const SAMPLE_CONTEXT: Record<string, string> = {
  "recipient_name": "Jane Smith",
  "client.name": "Jane Smith",
  "firm_name": "",
  "firm.name": "",
  "signing_url": typeof window !== "undefined"
    ? `${window.location.origin}/engagement/sample-token`
    : "/engagement/sample-token",
};

const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "client.name", label: "Client Name" },
  { key: "recipient_name", label: "Recipient Name" },
  { key: "firm.name", label: "Firm Name (Auto)" },
  { key: "signing_url", label: "Signing URL" },
  { key: "today", label: "Today's Date" },
  { key: "service.name", label: "Service Name" },
  { key: "fee.amount", label: "Fee Amount" },
];

const renderPlaceholders = (text: string, firmName: string): string => {
  const ctx = { ...SAMPLE_CONTEXT, firm_name: firmName, "firm.name": firmName };
  return Object.entries(ctx).reduce(
    (acc, [k, v]) => acc.split(`{{${k}}}`).join(v),
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
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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

  const insertAtCursor = (text: string) => {
    const ta = bodyRef.current;
    if (!ta) {
      setForm((f) => ({ ...f, body: f.body + text }));
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const next = ta.value.slice(0, start) + text + ta.value.slice(end);
    setForm((f) => ({ ...f, body: next }));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const wrapSelection = (before: string, after: string = before) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = ta.value.slice(start, end) || "text";
    const next = ta.value.slice(0, start) + before + selected + after + ta.value.slice(end);
    setForm((f) => ({ ...f, body: next }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

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
                      <TableCell>{v.client_type ? getClientTypeLabel(v.client_type) : "Any"}</TableCell>
                      <TableCell>{v.service_code ? formatServiceType(v.service_code) : "Any"}</TableCell>
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
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Variant" : "New Variant"}</DialogTitle>
            <DialogDescription>
              Leave client type or service blank to make the variant apply to any value at that level. Firm name is auto-populated from your organization settings.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
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
                    {CLIENT_TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t.value || "any"} value={t.value || "any"}>{t.label}</SelectItem>
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
                    {SERVICE_CODE_OPTIONS.map((s) => (
                      <SelectItem key={s.value || "any"} value={s.value || "any"}>{s.label}</SelectItem>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Body</Label>
                  <div className="flex items-center gap-1">
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Bold" onClick={() => wrapSelection("<strong>", "</strong>")}>
                      <Bold className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Italic" onClick={() => wrapSelection("<em>", "</em>")}>
                      <Italic className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Heading" onClick={() => wrapSelection("<h2>", "</h2>")}>
                      <Heading2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Bullet List" onClick={() => insertAtCursor("\n<ul>\n  <li>Item</li>\n</ul>\n")}>
                      <List className="h-3.5 w-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
                          <Variable className="h-3.5 w-3.5" /> Insert Field
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {PLACEHOLDERS.map((p) => (
                          <DropdownMenuItem key={p.key} onClick={() => insertAtCursor(`{{${p.key}}}`)}>
                            {p.label}
                            <span className="ml-auto text-xs text-muted-foreground">{`{{${p.key}}}`}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <Textarea
                  ref={bodyRef}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  rows={20}
                  className="font-mono text-sm leading-relaxed min-h-[420px]"
                  placeholder="Write the engagement letter body. Use the toolbar to insert formatting or merge fields."
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Eye className="h-4 w-4" />
                  Live Preview
                </div>
                <div className="rounded-md border bg-background p-4 min-h-[420px] max-h-[480px] overflow-y-auto">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Subject</div>
                  <div className="font-medium mb-4">{previewSubject}</div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Body</div>
                  <div
                    className="prose prose-sm max-w-none text-foreground"
                    dangerouslySetInnerHTML={{ __html: previewBody }}
                  />
                </div>
              </div>
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