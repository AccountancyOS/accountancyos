import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import type { BookkeepingEntity } from "./EntitySelector";
import {
  getInvoiceSettings, upsertInvoiceSettings, uploadInvoiceLogo, getInvoiceLogoSignedUrl,
  type InvoiceSettings,
} from "@/lib/invoice-settings-service";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: BookkeepingEntity | null;
}

const DEFAULT_EMAIL_SUBJECT = "Invoice {{invoice_number}} from {{business_name}}";
const DEFAULT_EMAIL_BODY =
  "Dear {{customer_name}},\n\nPlease find attached invoice {{invoice_number}} for {{amount}}, due {{due_date}}.\n\nPayment can be made by bank transfer using the details on the invoice.\n\nThank you,\n{{business_name}}";

export function InvoiceSettingsDialog({ open, onOpenChange, entity }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<InvoiceSettings>({});
  const [uploading, setUploading] = useState(false);

  const settingsEntity = entity ? { type: entity.type, id: entity.id } : null;

  const { data, isLoading } = useQuery({
    queryKey: ["invoice-settings", entity?.type, entity?.id],
    queryFn: () => getInvoiceSettings(settingsEntity!),
    enabled: open && !!settingsEntity,
  });

  useEffect(() => {
    if (open) {
      setForm({
        logo_url: data?.logo_url ?? null,
        bank_account_name: data?.bank_account_name ?? "",
        bank_sort_code: data?.bank_sort_code ?? "",
        bank_account_number: data?.bank_account_number ?? "",
        bank_reference: data?.bank_reference ?? "",
        payment_terms_days: data?.payment_terms_days ?? 30,
        invoice_footer: data?.invoice_footer ?? "",
        email_subject: data?.email_subject || DEFAULT_EMAIL_SUBJECT,
        email_body: data?.email_body || DEFAULT_EMAIL_BODY,
      });
    }
  }, [open, data]);

  // Logos live in a private bucket — resolve a signed URL for the preview.
  const { data: logoPreview } = useQuery({
    queryKey: ["invoice-logo-preview", form.logo_url],
    queryFn: () => getInvoiceLogoSignedUrl(form.logo_url),
    enabled: open && !!form.logo_url,
  });

  const set = (k: keyof InvoiceSettings, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settingsEntity) return;
    setUploading(true);
    try {
      const url = await uploadInvoiceLogo(settingsEntity, file);
      set("logo_url", url);
      toast.success("Logo uploaded");
    } catch (err: any) {
      toast.error("Logo upload failed", { description: err?.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!settingsEntity) throw new Error("No business selected");
      await upsertInvoiceSettings(settingsEntity, {
        ...form,
        payment_terms_days: Number(form.payment_terms_days) || 30,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-settings"] });
      toast.success("Invoice settings saved");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Failed to save", { description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice Settings{entity ? ` — ${entity.displayName}` : ""}</DialogTitle>
          <DialogDescription>
            Branding, bank details and the email your customers receive. These appear on the
            invoices this business sends.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Logo */}
            <div className="space-y-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="h-14 w-auto max-w-[180px] object-contain border rounded p-1" />
                ) : form.logo_url ? (
                  <div className="h-14 w-28 border rounded flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
                ) : (
                  <div className="h-14 w-28 border border-dashed rounded flex items-center justify-center text-xs text-muted-foreground">No logo</div>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickLogo} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Upload
                </Button>
              </div>
            </div>

            {/* Bank details */}
            <div className="space-y-2">
              <Label>Bank details (shown on the invoice as "how to pay")</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input placeholder="Account name" value={form.bank_account_name ?? ""} onChange={(e) => set("bank_account_name", e.target.value)} />
                <Input placeholder="Sort code" value={form.bank_sort_code ?? ""} onChange={(e) => set("bank_sort_code", e.target.value)} />
                <Input placeholder="Account number" value={form.bank_account_number ?? ""} onChange={(e) => set("bank_account_number", e.target.value)} />
                <Input placeholder="Payment reference (optional)" value={form.bank_reference ?? ""} onChange={(e) => set("bank_reference", e.target.value)} />
              </div>
            </div>

            {/* Terms + footer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="terms">Default payment terms (days)</Label>
                <Input id="terms" type="number" min={0} value={form.payment_terms_days ?? 30} onChange={(e) => set("payment_terms_days", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer">Invoice footer / notes</Label>
              <Textarea id="footer" rows={2} placeholder="e.g. Thank you for your business. Payment due within 30 days." value={form.invoice_footer ?? ""} onChange={(e) => set("invoice_footer", e.target.value)} />
            </div>

            {/* Customer email */}
            <div className="space-y-2">
              <Label>Customer email</Label>
              <p className="text-xs text-muted-foreground">
                Merge fields: {"{{customer_name}}"}, {"{{invoice_number}}"}, {"{{amount}}"}, {"{{due_date}}"}, {"{{business_name}}"}
              </p>
              <Input placeholder="Subject" value={form.email_subject ?? ""} onChange={(e) => set("email_subject", e.target.value)} />
              <Textarea rows={6} placeholder="Email message" value={form.email_body ?? ""} onChange={(e) => set("email_body", e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading || !entity}>
            {save.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
