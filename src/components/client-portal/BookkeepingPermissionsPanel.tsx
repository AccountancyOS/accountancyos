import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Props {
  entityKind: "client" | "company";
  entityId: string;
}

type PermRow = Record<string, boolean | string | null>;

const VIEW_FLAGS: { key: string; label: string; help: string }[] = [
  { key: "show_bank_accounts", label: "Bank Accounts", help: "Banking tab and connected feeds." },
  { key: "show_invoices", label: "Sales Invoices", help: "Sales module with invoices and customers." },
  { key: "show_bills", label: "Bills", help: "Purchases module with bills and suppliers." },
  { key: "show_vat_returns", label: "VAT Returns", help: "Client can see published VAT returns." },
  { key: "show_reports_summary", label: "Reports (Summary)", help: "High-level P&L and balance sheet summaries." },
  { key: "show_reports_detail", label: "Reports (Detail)", help: "Drill-down ledger detail in reports." },
];

const ACTION_FLAGS: { key: string; label: string; help: string }[] = [
  { key: "allow_bank_connect", label: "Connect Bank Feeds", help: "Client can initiate a bank connection." },
  { key: "allow_transaction_explain", label: "Explain Transactions", help: "Client can suggest categorisations for review." },
  { key: "allow_receipt_upload", label: "Upload Receipts", help: "Client can upload receipts for matching." },
  { key: "allow_invoice_create", label: "Create Invoices", help: "Client can draft and edit sales invoices." },
  { key: "allow_invoice_send", label: "Send Invoices", help: "Client can issue invoices to their customers." },
  { key: "allow_bill_create", label: "Create Bills", help: "Client can draft and edit supplier bills." },
  { key: "allow_vat_approval", label: "Approve VAT Returns", help: "Client can sign off VAT returns before filing." },
  { key: "allow_reports_download", label: "Download Reports", help: "Client can export reports to PDF/CSV." },
  { key: "allow_customer_create", label: "Create Customers", help: "Client can add their own customer records." },
  { key: "allow_supplier_create", label: "Create Suppliers", help: "Client can add their own supplier records." },
  { key: "allow_receipt_match", label: "Match Receipts", help: "Client can match receipts to transactions." },
  { key: "allow_query_respond", label: "Respond To Queries", help: "Client can answer accountant bookkeeping queries." },
  { key: "allow_client_reconcile", label: "Reconcile Bank", help: "Client can run bank reconciliation." },
];

const REVIEW_FLAGS: { key: string; label: string; help: string }[] = [
  { key: "require_review_for_transaction_explanations", label: "Review Transaction Explanations", help: "Hold client explanations as pending review before VAT close." },
  { key: "require_review_for_invoice_sending", label: "Approve Before Invoice Send", help: "Client invoices need accountant sign-off before being sent." },
  { key: "require_review_for_bill_approval", label: "Review Bills Before Posting", help: "Client-entered bills go to the review queue first." },
  { key: "require_review_for_receipt_matching", label: "Review Receipt Matches", help: "Receipts matched by client need accountant confirmation." },
  { key: "require_vat_client_approval", label: "Require Client VAT Approval", help: "Ask the client to approve VAT returns before submission." },
];

export function BookkeepingPermissionsPanel({ entityKind, entityId }: Props) {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const col = entityKind === "client" ? "client_id" : "company_id";

  const queryKey = ["portal-bookkeeping-perms", organization?.id, entityKind, entityId];

  const { data: row, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<PermRow> => {
      if (!organization?.id) return {};
      const { data, error } = await supabase
        .from("portal_visibility_settings")
        .select("*")
        .eq("organization_id", organization.id)
        .eq(col, entityId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {}) as PermRow;
    },
    enabled: !!organization?.id && !!entityId,
  });

  const mutation = useMutation({
    mutationFn: async (patch: Record<string, boolean>) => {
      if (!organization?.id) throw new Error("No organization");
      const payload: Record<string, unknown> = {
        organization_id: organization.id,
        [col]: entityId,
        ...patch,
      };
      const { error } = await supabase
        .from("portal_visibility_settings")
        .upsert(payload as any, { onConflict: "organization_id,client_id,company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Permissions Updated", description: "Client portal access updated." });
    },
    onError: (e: any) => {
      toast({ title: "Update Failed", description: e.message, variant: "destructive" });
    },
  });

  const renderRow = (key: string, label: string, help: string) => {
    const masterOn = !!row?.full_bookkeeping_access;
    const checked = masterOn ? true : !!row?.[key];
    return (
      <div key={key} className="flex items-start justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <Label htmlFor={`perm-${key}`} className="text-sm font-medium">
            {label}
            {masterOn && <span className="ml-2 text-xs text-muted-foreground">(included)</span>}
          </Label>
          <p className="text-xs text-muted-foreground">{help}</p>
        </div>
        <Switch
          id={`perm-${key}`}
          checked={checked}
          disabled={isLoading || mutation.isPending || masterOn}
          onCheckedChange={(val) => mutation.mutate({ [key]: val })}
        />
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bookkeeping Portal Permissions</CardTitle>
        <CardDescription>
          Control what this {entityKind === "client" ? "client" : "company"} can see and do in the
          bookkeeping area of the client portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <Label htmlFor="perm-full_bookkeeping_access" className="text-sm font-semibold">
                      Full Bookkeeping Access
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Treat the client as a self-serve bookkeeper. Unlocks bank connection, categorisation, invoice
                      and bill creation, payment matching and VAT approval in one switch. All entries are tagged as
                      client-posted in the audit log.
                    </p>
                  </div>
                </div>
                <Switch
                  id="perm-full_bookkeeping_access"
                  checked={!!row?.full_bookkeeping_access}
                  disabled={isLoading || mutation.isPending}
                  onCheckedChange={(val) => mutation.mutate({ full_bookkeeping_access: val })}
                />
              </div>
              {!!row?.full_bookkeeping_access && (
                <Alert>
                  <AlertDescription className="text-xs">
                    Granular toggles below are overridden while Full Bookkeeping Access is on.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="rounded-lg border p-4 space-y-3">
              <div>
                <Label className="text-sm font-semibold">Bookkeeping Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Controls how client writes flow into the ledger. Per-surface review flags below override individual
                  workflows.
                </p>
              </div>
              <RadioGroup
                value={(row?.client_bookkeeping_mode as unknown as string) ?? "operational"}
                onValueChange={(val) => mutation.mutate({ client_bookkeeping_mode: val } as any)}
                className="grid gap-2"
                disabled={mutation.isPending}
              >
                {[
                  { v: "operational", t: "Operational", d: "Client writes post immediately, accountant reviews later." },
                  { v: "review_required", t: "Review Required", d: "Client writes wait in the accountant review queue." },
                  { v: "accountant_only", t: "Accountant Only", d: "Client can view and respond only." },
                ].map((o) => (
                  <Label key={o.v} className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                    <RadioGroupItem value={o.v} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">{o.t}</p>
                      <p className="text-xs text-muted-foreground">{o.d}</p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Per-Surface Review</h4>
              <div className="divide-y">
                {REVIEW_FLAGS.map((f) => renderRow(f.key, f.label, f.help))}
              </div>
            </div>
            <Separator />
            <div>
              <h4 className="text-sm font-semibold mb-2">What They Can See</h4>
              <div className="divide-y">
                {VIEW_FLAGS.map((f) => renderRow(f.key, f.label, f.help))}
              </div>
            </div>
            <Separator />
            <div>
              <h4 className="text-sm font-semibold mb-2">What They Can Do</h4>
              <div className="divide-y">
                {ACTION_FLAGS.map((f) => renderRow(f.key, f.label, f.help))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}