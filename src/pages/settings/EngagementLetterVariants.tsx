import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sanitizeEmailHtml } from "@/lib/sanitizeHtml";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { CLIENT_TYPES as CLIENT_TYPE_VALUES, CLIENT_TYPE_LABELS, getClientTypeLabel } from "@/lib/client-types";
import { formatServiceType } from "@/lib/format-utils";
import { LetterEditor } from "@/components/engagement-letter/LetterEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  letter_body: string | null;
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

// Merge fields supported server-side when rendering the engagement letter document
// (see public.render_engagement_letter_body).
const LETTER_PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "firm_name", label: "Firm Name (Auto)" },
  { key: "client_name", label: "Client Name" },
  { key: "services_list", label: "Services List (Auto)" },
  { key: "currency", label: "Currency" },
  { key: "total_one_off", label: "Total One-Off Fees" },
  { key: "total_monthly", label: "Total Monthly Fees" },
  { key: "accepted_date", label: "Proposal Accepted Date" },
  { key: "today", label: "Today's Date" },
];

const LETTER_SAMPLE: Record<string, string> = {
  client_name: "Jane Smith",
  services_list:
    "<ul><li>Annual Accounts — GBP 1,200.00 (annual)</li><li>Confirmation Statement — GBP 60.00 (annual)</li></ul>",
  currency: "GBP",
  total_one_off: "1,260.00",
  total_monthly: "0.00",
  accepted_date: "12 Jun 2026",
  today: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
};

const renderLetterPlaceholders = (text: string, firmName: string): string => {
  const ctx = { ...LETTER_SAMPLE, firm_name: firmName, "firm.name": firmName };
  return Object.entries(ctx).reduce(
    (acc, [k, v]) => acc.split(`{{${k}}}`).join(v),
    text,
  );
};

const DEFAULT_LETTER_BODY = `<h1>Engagement Letter</h1>
<p>Between <strong>{{firm_name}}</strong> ("the Firm") and <strong>{{client_name}}</strong> ("the Client").</p>
<h2>Scope of Services</h2>
{{services_list}}
<h2>Fees</h2>
<p>One-off fees due now total {{currency}} {{total_one_off}}. Ongoing monthly fees total {{currency}} {{total_monthly}} per month.</p>
<h2>Confidentiality</h2>
<p>The Firm will treat all information received in the course of this engagement as confidential, except where disclosure is required by law or regulatory authority.</p>
<h2>Acceptance</h2>
<p>By signing below the Client confirms acceptance of the terms above, in respect of the proposal accepted on {{accepted_date}}.</p>`;

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
  letter_body: null,
  merge_fields: [],
};

export default function EngagementLetterVariants() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Variant | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [previewOpen, setPreviewOpen] = useState(false);

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
      letter_body: v.letter_body ?? null,
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
  const previewLetter = form.letter_body && form.letter_body.trim().length > 0
    ? renderLetterPlaceholders(form.letter_body, firmName)
    : renderLetterPlaceholders(DEFAULT_LETTER_BODY, firmName);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Engagement Letter & Email Templates</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Each variant defines the cover email a client receives and the engagement letter document they sign. The most specific active variant is selected at send-time.
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
              <Label>Cover Email Subject</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Engagement Letter For {{client.name}}"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cover Email Body</Label>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setPreviewOpen(true)}>
                  <Eye className="h-3.5 w-3.5" />
                  Preview With Sample Data
                </Button>
              </div>
              <LetterEditor
                value={form.body}
                onChange={(html) => setForm((f) => ({ ...f, body: html }))}
                placeholders={PLACEHOLDERS}
              />
              <p className="text-xs text-muted-foreground">
                The email a client receives in their inbox, with the link to view and sign their engagement letter.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Engagement Letter Document</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setForm((f) => ({ ...f, letter_body: DEFAULT_LETTER_BODY }))}
                >
                  Insert Default Wording
                </Button>
              </div>
              <LetterEditor
                value={form.letter_body ?? ""}
                onChange={(html) => setForm((f) => ({ ...f, letter_body: html }))}
                placeholders={LETTER_PLACEHOLDERS}
              />
              <p className="text-xs text-muted-foreground">
                The actual letter document the client sees and signs. Leave blank to use the built-in default wording. Use Insert Field for merge variables like scope of services, totals, and the accepted date.
              </p>
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

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Preview With Sample Data</DialogTitle>
            <DialogDescription>
              Merge fields are replaced with sample values so you can see how the cover email and signed letter will appear to a recipient.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="email" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="self-start">
              <TabsTrigger value="email">Cover Email</TabsTrigger>
              <TabsTrigger value="letter">Letter Document</TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="flex-1 overflow-y-auto bg-muted/30 p-6 rounded-md mt-2">
              <div className="mx-auto max-w-[720px] rounded-sm bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200">
                <div className="px-12 py-14 md:px-16 md:py-16">
                  <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1">Subject</div>
                  <div className="font-medium text-zinc-900 mb-6">{previewSubject}</div>
                  <div
                    className="letter-editor-prose"
                    dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(previewBody) }}
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="letter" className="flex-1 overflow-y-auto bg-muted/30 p-6 rounded-md mt-2">
              <div className="mx-auto max-w-[720px] rounded-sm bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200">
                <div className="px-12 py-14 md:px-16 md:py-16">
                  {(!form.letter_body || form.letter_body.trim().length === 0) && (
                    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      No custom letter wording — showing the built-in default. Click "Insert Default Wording" to start editing from it.
                    </div>
                  )}
                  <div
                    className="letter-editor-prose"
                    dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(previewLetter) }}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
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