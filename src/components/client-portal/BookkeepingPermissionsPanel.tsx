import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  entityKind: "client" | "company";
  entityId: string;
}

type PermRow = Record<string, boolean | null>;

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
        .upsert(payload, { onConflict: "organization_id,client_id,company_id" });
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
    const checked = !!row?.[key];
    return (
      <div key={key} className="flex items-start justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <Label htmlFor={`perm-${key}`} className="text-sm font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground">{help}</p>
        </div>
        <Switch
          id={`perm-${key}`}
          checked={checked}
          disabled={isLoading || mutation.isPending}
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
          bookkeeping area of the client portal. All actions remain subject to accountant review.
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