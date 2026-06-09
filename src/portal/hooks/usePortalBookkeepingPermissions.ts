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
  // Master toggle — when true, all flags below are forced to true
  allowFullBookkeeping: boolean;
  // Operating mode for this entity
  mode: "operational" | "review_required" | "accountant_only";
  // Per-surface review requirements
  requireReviewForTransactionExplanations: boolean;
  requireReviewForInvoiceSending: boolean;
  requireReviewForBillApproval: boolean;
  requireReviewForReceiptMatching: boolean;
  requireVATClientApproval: boolean;
  allowClientReconcile: boolean;
  allowClientPostToLedger: boolean;
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
  allowCustomerCreate: boolean;
  allowSupplierCreate: boolean;
  allowReceiptMatch: boolean;
  allowQueryRespond: boolean;
}

const DEFAULTS: PortalBookkeepingPermissions = {
  allowFullBookkeeping: false,
  mode: "operational",
  requireReviewForTransactionExplanations: false,
  requireReviewForInvoiceSending: false,
  requireReviewForBillApproval: true,
  requireReviewForReceiptMatching: false,
  requireVATClientApproval: false,
  allowClientReconcile: false,
  allowClientPostToLedger: false,
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
  allowCustomerCreate: false,
  allowSupplierCreate: false,
  allowReceiptMatch: false,
  allowQueryRespond: false,
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
            "full_bookkeeping_access",
            "client_bookkeeping_mode",
            "require_review_for_transaction_explanations",
            "require_review_for_invoice_sending",
            "require_review_for_bill_approval",
            "require_review_for_receipt_matching",
            "require_vat_client_approval",
            "allow_client_reconcile",
            "allow_client_post_to_ledger",
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
            "allow_customer_create",
            "allow_supplier_create",
            "allow_receipt_match",
            "allow_query_respond",
          ].join(","),
        )
        .eq(col, currentEntity.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return DEFAULTS;
      const r = data as unknown as Record<string, any>;
      const master = !!r.full_bookkeeping_access;
      // Master flag short-circuit: every per-flag becomes true server-side
      // via portal_has_perm; mirror that here so the UI lights up too.
      const on = (key: string) => master || !!r[key];
      const mode = (r.client_bookkeeping_mode as PortalBookkeepingPermissions["mode"]) ?? "operational";
      return {
        allowFullBookkeeping: master,
        mode,
        requireReviewForTransactionExplanations: !!r.require_review_for_transaction_explanations,
        requireReviewForInvoiceSending: !!r.require_review_for_invoice_sending,
        requireReviewForBillApproval: r.require_review_for_bill_approval ?? true,
        requireReviewForReceiptMatching: !!r.require_review_for_receipt_matching,
        requireVATClientApproval: !!r.require_vat_client_approval,
        allowClientReconcile: master || !!r.allow_client_reconcile,
        allowClientPostToLedger: master || !!r.allow_client_post_to_ledger,
        showBankAccounts: on("show_bank_accounts"),
        showTransactions: on("show_transactions"),
        showInvoices: on("show_invoices"),
        showBills: on("show_bills"),
        showVATReturns: on("show_vat_returns"),
        showReportsSummary: on("show_reports_summary"),
        showReportsDetail: on("show_reports_detail"),
        allowBankConnect: on("allow_bank_connect"),
        allowTransactionExplain: on("allow_transaction_explain"),
        allowReceiptUpload: on("allow_receipt_upload"),
        allowInvoiceCreate: on("allow_invoice_create"),
        allowInvoiceSend: on("allow_invoice_send"),
        allowBillCreate: on("allow_bill_create"),
        allowVATApproval: on("allow_vat_approval"),
        allowReportsDownload: on("allow_reports_download"),
        allowCustomerCreate: master || r.allow_customer_create !== false,
        allowSupplierCreate: master || r.allow_supplier_create !== false,
        allowReceiptMatch: master || r.allow_receipt_match !== false,
        allowQueryRespond: master || r.allow_query_respond !== false,
      };
    },
    enabled: !!currentEntity,
    staleTime: 60_000,
  });
}