import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePortalEntity } from "../contexts/PortalEntityContext";

/**
 * Granular bookkeeping permissions for the currently selected portal
 * entity. Reads `portal_visibility_settings`. All flags default to
 * `false` when no row exists so a freshly enabled service is locked
 * down until the accountant turns features on.
 *
 * Server-side enforcement lives in the `portal_has_perm` RPC and the
 * RLS policies that call it. The UI uses these flags to hide actions
 * the user could not perform anyway, but RLS is the source of truth.
 */
export interface PortalBookkeepingPermissions {
  // View toggles
  showBankAccounts: boolean;
  showTransactions: boolean;
  showInvoices: boolean;
  showBills: boolean;
  showVATReturns: boolean;
  showReportsSummary: boolean;
  showReportsDetail: boolean;
  // Action toggles
  allowBankConnect: boolean;
  allowTransactionExplain: boolean;
  allowReceiptUpload: boolean;
  allowInvoiceCreate: boolean;
  allowInvoiceSend: boolean;
  allowBillCreate: boolean;
  allowVATApproval: boolean;
  allowReportsDownload: boolean;
}

const DEFAULTS: PortalBookkeepingPermissions = {
  showBankAccounts: false,
  showTransactions: false,
  showInvoices: false,
  showBills: false,
  showVATReturns: false,
  showReportsSummary: false,
  showReportsDetail: false,
  allowBankConnect: false,
  allowTransactionExplain: false,
  allowReceiptUpload: false,
  allowInvoiceCreate: false,
  allowInvoiceSend: false,
  allowBillCreate: false,
  allowVATApproval: false,
  allowReportsDownload: false,
};

export function usePortalBookkeepingPermissions() {
  const { currentEntity } = usePortalEntity();

  return useQuery({
    queryKey: [
      "portal",
      "bookkeeping-perms",
      currentEntity?.type,
      currentEntity?.id,
    ],
    queryFn: async (): Promise<PortalBookkeepingPermissions> => {
      if (!currentEntity) return DEFAULTS;

      const col = currentEntity.type === "client" ? "client_id" : "company_id";
      const { data, error } = await supabase
        .from("portal_visibility_settings")
        .select(
          [
            "show_bank_accounts",
            "show_transactions",
            "show_invoices",
            "show_bills",
            "show_vat_returns",
            "show_reports_summary",
            "show_reports_detail",
            "allow_bank_connect",
            "allow_transaction_explain",
            "allow_receipt_upload",
            "allow_invoice_create",
            "allow_invoice_send",
            "allow_bill_create",
            "allow_vat_approval",
            "allow_reports_download",
          ].join(","),
        )
        .eq(col, currentEntity.id)
        .maybeSingle();

      if (error || !data) return DEFAULTS;
      const r = data as Record<string, boolean | null>;
      return {
        showBankAccounts: !!r.show_bank_accounts,
        showTransactions: !!r.show_transactions,
        showInvoices: !!r.show_invoices,
        showBills: !!r.show_bills,
        showVATReturns: !!r.show_vat_returns,
        showReportsSummary: !!r.show_reports_summary,
        showReportsDetail: !!r.show_reports_detail,
        allowBankConnect: !!r.allow_bank_connect,
        allowTransactionExplain: !!r.allow_transaction_explain,
        allowReceiptUpload: !!r.allow_receipt_upload,
        allowInvoiceCreate: !!r.allow_invoice_create,
        allowInvoiceSend: !!r.allow_invoice_send,
        allowBillCreate: !!r.allow_bill_create,
        allowVATApproval: !!r.allow_vat_approval,
        allowReportsDownload: !!r.allow_reports_download,
      };
    },
    enabled: !!currentEntity,
    staleTime: 60_000,
  });
}