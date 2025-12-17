import { useState, useEffect, useCallback } from "react";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";

interface InvoiceLine {
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  account_id: string;
  vat_code_id: string;
  vat_rate: number;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
}

interface InvoiceDraft {
  contact_name: string;
  customer_id: string;
  invoice_number: string;
  reference: string;
  issue_date: string;
  due_date: string;
  notes: string;
  lines: InvoiceLine[];
  entity: { type: "client" | "company"; id: string } | null;
  invoiceType: "SALES" | "PURCHASE";
}

const DEFAULT_DRAFT: InvoiceDraft = {
  contact_name: "",
  customer_id: "",
  invoice_number: "",
  reference: "",
  issue_date: new Date().toISOString().split("T")[0],
  due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  notes: "",
  lines: [{
    line_number: 1,
    description: "",
    quantity: 1,
    unit_price: 0,
    account_id: "",
    vat_code_id: "",
    vat_rate: 0,
    net_amount: 0,
    vat_amount: 0,
    gross_amount: 0,
  }],
  entity: null,
  invoiceType: "SALES",
};

function getDraftKey(orgId: string, userId: string) {
  return `invoice_draft:${orgId}:${userId}`;
}

export function useInvoiceDraft() {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const storageKey = organization?.id && user?.id 
    ? getDraftKey(organization.id, user.id) 
    : null;

  // Load draft from session storage on mount
  useEffect(() => {
    if (!storageKey) return;

    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setDraft(parsed);
      }
    } catch (e) {
      console.error("Failed to load invoice draft:", e);
    }
    setIsLoaded(true);
  }, [storageKey]);

  // Save draft to session storage
  const saveDraft = useCallback((newDraft: InvoiceDraft) => {
    if (!storageKey) return;
    
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(newDraft));
      setDraft(newDraft);
    } catch (e) {
      console.error("Failed to save invoice draft:", e);
    }
  }, [storageKey]);

  // Clear draft from session storage
  const clearDraft = useCallback(() => {
    if (!storageKey) return;
    
    try {
      sessionStorage.removeItem(storageKey);
      setDraft(null);
    } catch (e) {
      console.error("Failed to clear invoice draft:", e);
    }
  }, [storageKey]);

  // Check if there's a pending draft
  const hasDraft = draft !== null && (
    draft.contact_name || 
    draft.customer_id || 
    draft.lines.some(l => l.description || l.unit_price > 0)
  );

  return {
    draft,
    hasDraft,
    isLoaded,
    saveDraft,
    clearDraft,
    defaultDraft: DEFAULT_DRAFT,
  };
}
